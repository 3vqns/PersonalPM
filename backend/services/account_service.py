"""Backend-owned account and face-profile lifecycle services."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import BackgroundTasks, UploadFile

from backend.config import getSettings
from backend.core.supabase_admin import get_supabase_admin_client
from backend.dependencies.auth import AuthenticatedUser, clear_auth_user_cache
from backend.errors import AppError
from backend.schemas.account import (
    AccountResponse,
    AccountUserResponse,
    FaceProfileImageRecord,
    FaceProfileStatusResponse,
    PublicUserRecord,
)
from backend.services.cloudinary_service import cloudinary_public_id_from_url, upload_account_avatar
from backend.services.face_profile_storage_service import store_enrollment_selfie
from backend.services.media_cleanup_service import drain_media_cleanup, queue_media_cleanup
from backend.services.matching_service import ensure_user_rematch_capacity, trigger_user_active_event_rematch

logger = logging.getLogger("pictureme.account")
_ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png"}
_MIN_ENROLLMENT_SELFIES = 3
_MAX_ENROLLMENT_SELFIES = 5
_FACE_PROFILE_BASE_COLUMNS = "id,user_id,storage_path,sort_order,created_at"
_FACE_PROFILE_EXTENDED_COLUMNS = f"{_FACE_PROFILE_BASE_COLUMNS},cloudinary_id,cloudinary_url"


def get_account(current_user: AuthenticatedUser) -> AccountResponse:
    """Fetch or provision the current user's account row."""
    user_record = get_public_user_record(current_user)
    return _build_account_response(user_record)


async def update_account_profile(
    current_user: AuthenticatedUser,
    *,
    name: str,
    avatar: UploadFile | None = None,
) -> AccountResponse:
    """Update the current user's editable account profile fields."""
    cleaned_name = name.strip()
    if not cleaned_name:
        raise AppError("A profile name is required", code="VALIDATION_ERROR", status=422)

    update_payload: dict[str, str] = {"name": cleaned_name}
    existingAvatar = get_public_user_record(current_user).avatar_url if avatar is not None and avatar.filename else None
    if avatar is not None and avatar.filename:
        avatar_url = await upload_account_avatar(user_id=current_user.user_id, upload=avatar)
        if not avatar_url:
            raise AppError("PictureMe could not upload your avatar", code="AVATAR_UPLOAD_FAILED", status=502)
        update_payload["avatar_url"] = avatar_url

    client = get_supabase_admin_client()
    try:
        if "avatar_url" in update_payload:
            oldAvatarId = cloudinary_public_id_from_url(
                existingAvatar, f"{getSettings().account_avatar_folder}/{current_user.user_id}"
            )
            client.rpc("update_account_avatar", {
                "user_id_input": current_user.user_id,
                "name_input": cleaned_name,
                "avatar_url_input": update_payload["avatar_url"],
                "expected_avatar_url": existingAvatar,
                "old_avatar_id": oldAvatarId,
            }).execute()
        else:
            client.table("users").update(update_payload).eq("id", current_user.user_id).execute()
    except Exception as exc:
        if update_payload.get("avatar_url"):
            _queue_avatar_url(update_payload["avatar_url"], current_user.user_id)
        raise AppError("PictureMe could not update your profile", code="ACCOUNT_UPDATE_FAILED", status=500) from exc

    if existingAvatar and existingAvatar != update_payload.get("avatar_url"):
        _queue_avatar_url(existingAvatar, current_user.user_id)

    return get_account(current_user)


async def replace_face_profile(
    current_user: AuthenticatedUser,
    *,
    selfies: list[UploadFile],
    background_tasks: BackgroundTasks | None = None,
) -> FaceProfileStatusResponse:
    """Store a fresh 3-5 selfie enrollment set and mark the face profile complete."""
    _validate_selfie_count(len(selfies))
    ensure_user_rematch_capacity(current_user.user_id)

    existing_assets = _list_face_profile_images(current_user.user_id)
    uploaded_assets: list[dict] = []

    try:
        for sort_order, selfie in enumerate(selfies, start=1):
            uploaded_assets.append(await _upload_enrollment_selfie(current_user.user_id, selfie, sort_order))
    except Exception:
        _delete_face_profile_assets(uploaded_assets)
        raise

    client = get_supabase_admin_client()
    updated_at = datetime.now(timezone.utc)
    persisted_assets = [_serialize_face_profile_asset(asset) for asset in uploaded_assets]
    try:
        oldCloudinaryIds, oldStoragePaths = _face_profile_asset_keys(existing_assets)
        client.rpc("replace_face_profile_assets", {
            "user_id_input": current_user.user_id,
            "images": persisted_assets,
            "old_cloudinary_ids": oldCloudinaryIds,
            "old_storage_paths": oldStoragePaths,
            "indexed_at": updated_at.isoformat(),
        }).execute()
    except Exception as exc:
        _delete_face_profile_assets(uploaded_assets)
        raise AppError("PictureMe could not save your face profile", code="FACE_PROFILE_SAVE_FAILED", status=500) from exc

    if existing_assets:
        _delete_face_profile_assets(existing_assets, suppress_errors=True)

    if background_tasks is not None:
        background_tasks.add_task(
            trigger_user_active_event_rematch,
            user_id=current_user.user_id,
            reason="face-profile-upsert",
        )
    else:
        trigger_user_active_event_rematch(user_id=current_user.user_id, reason="face-profile-upsert")
    return FaceProfileStatusResponse(hasFaceProfile=True, indexedAt=updated_at)


def delete_face_profile(current_user: AuthenticatedUser) -> FaceProfileStatusResponse:
    """Remove enrollment selfies and clear dependent match rows."""
    existing_assets = _list_face_profile_images(current_user.user_id)
    if existing_assets:
        _delete_face_profile_assets(existing_assets)

    client = get_supabase_admin_client()
    try:
        _clear_user_matches(current_user.user_id)
        client.table("face_profile_images").delete().eq("user_id", current_user.user_id).execute()
        client.table("users").update(
            {
                "face_indexed_at": None,
                "rekognition_face_id": None,
            }
        ).eq("id", current_user.user_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not delete your face profile", code="FACE_PROFILE_DELETE_FAILED", status=500) from exc

    return FaceProfileStatusResponse(hasFaceProfile=False, indexedAt=None)


def delete_account(current_user: AuthenticatedUser) -> None:
    """Delete an account, transferring owned events and retaining event photos."""
    userRecord = get_public_user_record(current_user)
    _require_transferable_owned_events(current_user.user_id)
    delete_face_profile(current_user)

    avatarId = cloudinary_public_id_from_url(
        userRecord.avatar_url, f"{getSettings().account_avatar_folder}/{current_user.user_id}"
    )
    if avatarId:
        queue_media_cleanup(provider="cloudinary", assetKeys=[avatarId])
        if not drain_media_cleanup(assetKeys=[avatarId], provider="cloudinary"):
            raise AppError("Avatar deletion is pending; retry account deletion", code="AVATAR_DELETE_PENDING", status=502)

    client = get_supabase_admin_client()
    try:
        client.rpc("prepare_account_deletion", {"user_id_input": current_user.user_id}).execute()
    except Exception as exc:
        if "event has no active admin for transfer" in str(exc):
            raise AppError(
                "Every owned event needs an active admin before account deletion",
                code="ACCOUNT_EVENT_TRANSFER_UNAVAILABLE",
                status=409,
            ) from exc
        raise AppError("PictureMe could not delete your account", code="ACCOUNT_DELETE_FAILED", status=500) from exc
    try:
        client.auth.admin.delete_user(current_user.user_id)
        clear_auth_user_cache()
    except Exception as exc:
        raise AppError("PictureMe could not delete your account", code="ACCOUNT_DELETE_FAILED", status=500) from exc


def _require_transferable_owned_events(userId: str) -> None:
    """Avoid deleting account media when an owned event has no successor."""
    try:
        response = get_supabase_admin_client().rpc(
            "check_account_deletion_transfers", {"user_id_input": userId}
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not check event ownership transfers", code="ACCOUNT_DELETE_CHECK_FAILED", status=500) from exc
    if response.data is not True:
        raise AppError(
            "Every owned event needs an active admin before account deletion",
            code="ACCOUNT_EVENT_TRANSFER_UNAVAILABLE",
            status=409,
        )


def _build_account_response(user_record: PublicUserRecord) -> AccountResponse:
    """Map an internal user record to the frontend account response."""
    return AccountResponse(
        user=AccountUserResponse(
            id=user_record.id,
            email=user_record.email,
            name=user_record.name,
            avatarUrl=user_record.avatar_url,
            hasFaceProfile=user_record.has_face_profile,
            faceIndexedAt=user_record.face_indexed_at,
        )
    )


def get_public_user_record(current_user: AuthenticatedUser) -> PublicUserRecord:
    """Fetch the current public user row, creating it from auth data if missing."""
    client = get_supabase_admin_client()

    try:
        response = client.table("users").select(
            "id,email,name,avatar_url,face_indexed_at,rekognition_face_id"
        ).eq("id", current_user.user_id).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not load your account", code="ACCOUNT_FETCH_FAILED", status=500) from exc

    if response.data:
        return PublicUserRecord.model_validate(response.data)

    auth_name = _resolve_display_name(current_user)
    auth_avatar_url = current_user.raw_user.get("user_metadata", {}).get("avatar_url")
    try:
        client.table("users").upsert(
            {
                "id": current_user.user_id,
                "email": current_user.email or current_user.raw_user.get("email") or "",
                "name": auth_name,
                "avatar_url": auth_avatar_url,
                "face_indexed_at": None,
                "rekognition_face_id": None,
            }
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not provision your account", code="ACCOUNT_PROVISION_FAILED", status=500) from exc

    return PublicUserRecord(
        id=current_user.user_id,
        email=current_user.email or current_user.raw_user.get("email") or "",
        name=auth_name,
        avatar_url=auth_avatar_url,
        face_indexed_at=None,
        rekognition_face_id=None,
    )


def _list_face_profile_images(user_id: str) -> list[FaceProfileImageRecord]:
    """Fetch the current stored enrollment selfie metadata for a user."""
    client = get_supabase_admin_client()
    try:
        response = client.table("face_profile_images").select(_face_profile_select_columns()).eq("user_id", user_id).order("sort_order").execute()
    except Exception as exc:
        raise AppError("PictureMe could not load your face profile", code="FACE_PROFILE_FETCH_FAILED", status=500) from exc

    rows = response.data or []
    return [FaceProfileImageRecord.model_validate(row) for row in rows]


async def _upload_enrollment_selfie(user_id: str, selfie: UploadFile, sort_order: int) -> dict:
    """Validate and upload one enrollment selfie into Cloudinary."""
    content_type = selfie.content_type or ""
    if content_type not in _ALLOWED_IMAGE_CONTENT_TYPES:
        raise AppError(
            "Enrollment selfies must be JPEG or PNG images",
            code="INVALID_SELFIE_TYPE",
            status=422,
            details={"contentType": content_type or None},
        )

    content = await selfie.read(getSettings().max_face_profile_selfie_size_bytes + 1)
    if not content:
        raise AppError("Enrollment selfie upload was empty", code="INVALID_SELFIE", status=422)
    if len(content) > getSettings().max_face_profile_selfie_size_bytes:
        raise AppError(
            "Enrollment selfies exceed the allowed upload size",
            code="SELFIE_TOO_LARGE",
            status=422,
            details={"maxBytes": getSettings().max_face_profile_selfie_size_bytes, "receivedBytes": len(content)},
        )

    storage_key = store_enrollment_selfie(userId=user_id, sortOrder=sort_order, content=content, contentType=content_type)

    return {
        "user_id": user_id,
        "storage_path": storage_key,
        "cloudinary_id": None,
        "cloudinary_url": None,
        "sort_order": sort_order,
    }


def _clear_user_matches(user_id: str) -> None:
    """Delete dependent match rows for a user."""
    try:
        get_supabase_admin_client().table("user_photo_matches").delete().eq("user_id", user_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not clear your existing matches", code="MATCH_CLEANUP_FAILED", status=500) from exc


def _delete_face_profile_assets(assets: list[FaceProfileImageRecord | dict], *, suppress_errors: bool = False) -> None:
    """Delete one or more enrollment selfie assets from their backing provider."""
    if not assets:
        return
    try:
        cloudinaryIds, storagePaths = _queue_face_profile_assets(assets)
        deleted = drain_media_cleanup(assetKeys=cloudinaryIds, provider="cloudinary") and drain_media_cleanup(
            assetKeys=storagePaths, provider="supabase_storage", bucket=getSettings().face_profile_bucket
        )
        if not deleted:
            raise AppError("Some enrollment selfies still need deletion", code="SELFIE_DELETE_FAILED", status=502)
    except Exception as exc:
        if suppress_errors:
            logger.warning("Failed to delete replaced face-profile assets; queued cleanup remains")
            return
        raise AppError("PictureMe could not delete your enrollment selfies", code="SELFIE_DELETE_FAILED", status=500) from exc


def _queue_face_profile_assets(assets: list[FaceProfileImageRecord | dict]) -> tuple[list[str], list[str]]:
    cloudinaryIds, storagePaths = _face_profile_asset_keys(assets)
    queue_media_cleanup(provider="cloudinary", assetKeys=cloudinaryIds)
    queue_media_cleanup(provider="supabase_storage", assetKeys=storagePaths, bucket=getSettings().face_profile_bucket)
    return cloudinaryIds, storagePaths


def _face_profile_asset_keys(assets: list[FaceProfileImageRecord | dict]) -> tuple[list[str], list[str]]:
    cloudinaryIds: list[str] = []
    storagePaths: list[str] = []
    for asset in assets:
        userId = asset.user_id if isinstance(asset, FaceProfileImageRecord) else asset.get("user_id")
        cloudinaryId = asset.cloudinary_id if isinstance(asset, FaceProfileImageRecord) else asset.get("cloudinary_id")
        cloudinaryUrl = asset.cloudinary_url if isinstance(asset, FaceProfileImageRecord) else asset.get("cloudinary_url")
        storagePath = asset.storage_path if isinstance(asset, FaceProfileImageRecord) else asset.get("storage_path")
        if not userId:
            raise AppError("Enrollment selfie owner is missing", code="SELFIE_ASSET_ID_UNKNOWN", status=409)
        expectedPrefix = f"{getSettings().face_profile_folder.rstrip('/')}/{userId}"
        if cloudinaryId:
            if not cloudinaryId.startswith(expectedPrefix + "/"):
                raise AppError("Enrollment selfie asset ID requires provider review", code="SELFIE_ASSET_ID_UNKNOWN", status=409)
            for remoteUrl in (cloudinaryUrl, storagePath if _is_remote_path(storagePath) else None):
                if remoteUrl and cloudinary_public_id_from_url(remoteUrl, expectedPrefix) != cloudinaryId:
                    raise AppError("Enrollment selfie asset references disagree", code="SELFIE_ASSET_ID_UNKNOWN", status=409)
            cloudinaryIds.append(cloudinaryId)
        elif cloudinaryUrl or _is_remote_path(storagePath):
            inferredId = cloudinary_public_id_from_url(cloudinaryUrl or storagePath, expectedPrefix)
            if not inferredId:
                raise AppError("Enrollment selfie asset ID requires provider review", code="SELFIE_ASSET_ID_UNKNOWN", status=409)
            if storagePath and storagePath.startswith(getSettings().face_profile_folder.rstrip("/") + "/") and storagePath != inferredId:
                raise AppError("Enrollment selfie asset references disagree", code="SELFIE_ASSET_ID_UNKNOWN", status=409)
            cloudinaryIds.append(inferredId)
        elif storagePath and storagePath.startswith(getSettings().face_profile_folder.rstrip("/") + "/"):
            if not storagePath.startswith(expectedPrefix + "/"):
                raise AppError("Enrollment selfie asset ID requires provider review", code="SELFIE_ASSET_ID_UNKNOWN", status=409)
            cloudinaryIds.append(storagePath)

        if storagePath and not _is_remote_path(storagePath) and not storagePath.startswith(
            getSettings().face_profile_folder.rstrip("/") + "/"
        ):
            pathParts = storagePath.split("/")
            if len(pathParts) < 2 or pathParts[0] != userId or any(part in {"", ".", ".."} for part in pathParts):
                raise AppError("Enrollment selfie path requires review", code="SELFIE_ASSET_ID_UNKNOWN", status=409)
            storagePaths.append(storagePath)
        if not cloudinaryId and not cloudinaryUrl and not storagePath:
            raise AppError("Enrollment selfie asset reference is missing", code="SELFIE_ASSET_ID_UNKNOWN", status=409)
    return cloudinaryIds, storagePaths


def _queue_avatar_url(url: str, userId: str) -> None:
    expectedPrefix = f"{getSettings().account_avatar_folder}/{userId}"
    publicId = cloudinary_public_id_from_url(url, expectedPrefix)
    if publicId:
        queue_media_cleanup(provider="cloudinary", assetKeys=[publicId])
        drain_media_cleanup(assetKeys=[publicId], provider="cloudinary")


def _resolve_display_name(current_user: AuthenticatedUser) -> str:
    """Resolve the best available display name from the authenticated user context."""
    user_metadata = current_user.raw_user.get("user_metadata", {})
    return (
        user_metadata.get("name")
        or user_metadata.get("full_name")
        or current_user.email
        or "PictureMe User"
    )


def _validate_selfie_count(count: int) -> None:
    """Ensure the client submitted the required enrollment selfie count."""
    if _MIN_ENROLLMENT_SELFIES <= count <= _MAX_ENROLLMENT_SELFIES:
        return

    raise AppError(
        "Face profile enrollment requires 3 to 5 selfie images",
        code="INVALID_SELFIE_COUNT",
        status=422,
        details={"min": _MIN_ENROLLMENT_SELFIES, "max": _MAX_ENROLLMENT_SELFIES, "received": count},
    )


def _serialize_face_profile_asset(asset: dict) -> dict:
    """Persist Cloudinary metadata when supported, otherwise fall back to the legacy table shape."""
    if _face_profile_supports_cloudinary_columns():
        return asset

    return {
        "user_id": asset["user_id"],
        "storage_path": asset["storage_path"],
        "sort_order": asset["sort_order"],
    }


@lru_cache(maxsize=1)
def _face_profile_supports_cloudinary_columns() -> bool:
    """Return whether the current face_profile_images table includes Cloudinary metadata columns."""
    try:
        get_supabase_admin_client().table("face_profile_images").select(_FACE_PROFILE_EXTENDED_COLUMNS).limit(1).execute()
        return True
    except Exception as exc:
        if _is_missing_face_profile_cloudinary_columns_error(exc):
            return False
        raise


def _face_profile_select_columns() -> str:
    """Return the safest select list for the current face_profile_images schema."""
    return _FACE_PROFILE_EXTENDED_COLUMNS if _face_profile_supports_cloudinary_columns() else _FACE_PROFILE_BASE_COLUMNS


def _is_missing_face_profile_cloudinary_columns_error(exc: Exception) -> bool:
    """Detect PostgREST column-missing errors for backward-compatible face-profile reads."""
    message = str(exc).lower()
    return "cloudinary_id" in message or "cloudinary_url" in message


def _is_remote_path(value: str | None) -> bool:
    return bool(value and value.startswith(("http://", "https://")))
