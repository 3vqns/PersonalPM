"""Backend-owned account and face-profile lifecycle services."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from functools import lru_cache
from urllib.parse import urlparse

from fastapi import BackgroundTasks, UploadFile

from backend.config import getSettings
from backend.core.supabase_admin import get_supabase_admin_client
from backend.dependencies.auth import AuthenticatedUser
from backend.errors import AppError
from backend.schemas.account import (
    AccountResponse,
    AccountUserResponse,
    FaceProfileImageRecord,
    FaceProfileStatusResponse,
    PublicUserRecord,
)
from backend.services.cloudinary_service import delete_face_profile_assets, upload_account_avatar, upload_face_profile_selfie
from backend.services.matching_service import trigger_user_active_event_rematch

logger = logging.getLogger("pictureme.account")
_ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
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
    if avatar is not None and avatar.filename:
        avatar_url = await upload_account_avatar(user_id=current_user.user_id, upload=avatar)
        if not avatar_url:
            raise AppError("PictureMe could not upload your avatar", code="AVATAR_UPLOAD_FAILED", status=502)
        update_payload["avatar_url"] = avatar_url

    client = get_supabase_admin_client()
    try:
        client.table("users").update(update_payload).eq("id", current_user.user_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not update your profile", code="ACCOUNT_UPDATE_FAILED", status=500) from exc

    return get_account(current_user)


async def replace_face_profile(
    current_user: AuthenticatedUser,
    *,
    selfies: list[UploadFile],
    background_tasks: BackgroundTasks | None = None,
) -> FaceProfileStatusResponse:
    """Store a fresh 3-5 selfie enrollment set and mark the face profile complete."""
    _validate_selfie_count(len(selfies))

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
        client.table("face_profile_images").delete().eq("user_id", current_user.user_id).execute()
        client.table("face_profile_images").insert(persisted_assets).execute()
        client.table("users").update(
            {
                "face_indexed_at": updated_at.isoformat(),
            }
        ).eq("id", current_user.user_id).execute()
        _clear_user_matches(current_user.user_id)
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
            "Enrollment selfies must be JPEG, PNG, WebP, or HEIC images",
            code="INVALID_SELFIE_TYPE",
            status=422,
            details={"contentType": content_type or None},
        )

    content = await selfie.read()
    if not content:
        raise AppError("Enrollment selfie upload was empty", code="INVALID_SELFIE", status=422)
    if len(content) > getSettings().max_face_profile_selfie_size_bytes:
        raise AppError(
            "Enrollment selfies exceed the allowed upload size",
            code="SELFIE_TOO_LARGE",
            status=422,
            details={"maxBytes": getSettings().max_face_profile_selfie_size_bytes, "receivedBytes": len(content)},
        )

    await selfie.seek(0)
    upload_result = await upload_face_profile_selfie(user_id=user_id, sort_order=sort_order, upload=selfie)
    storage_key = upload_result["public_id"]

    return {
        "user_id": user_id,
        "storage_path": storage_key,
        "cloudinary_id": upload_result["public_id"],
        "cloudinary_url": upload_result["cloudinary_url"],
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

    cloudinary_ids: list[str] = []
    storage_paths: list[str] = []
    for asset in assets:
        cloudinary_id = asset.cloudinary_id if isinstance(asset, FaceProfileImageRecord) else asset.get("cloudinary_id")
        storage_path = asset.storage_path if isinstance(asset, FaceProfileImageRecord) else asset.get("storage_path")
        if cloudinary_id:
            cloudinary_ids.append(cloudinary_id)
        elif _is_cloudinary_url(storage_path):
            inferred_public_id = _extract_cloudinary_public_id(storage_path)
            if inferred_public_id:
                cloudinary_ids.append(inferred_public_id)
        elif storage_path:
            storage_paths.append(storage_path)

    try:
        if cloudinary_ids:
            delete_face_profile_assets(public_ids=cloudinary_ids)
        if storage_paths:
            get_supabase_admin_client().storage.from_(getSettings().face_profile_bucket).remove(storage_paths)
    except Exception as exc:
        if suppress_errors:
            logger.warning(
                "Failed to delete replaced face-profile assets",
                extra={"cloudinaryIds": cloudinary_ids, "storagePaths": storage_paths},
            )
            return
        raise AppError("PictureMe could not delete your enrollment selfies", code="SELFIE_DELETE_FAILED", status=500) from exc


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
        "storage_path": asset["cloudinary_url"],
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


def _is_cloudinary_url(value: str | None) -> bool:
    """Return whether a stored face-profile path is actually a Cloudinary delivery URL."""
    return bool(value and value.startswith(("http://", "https://")) and "res.cloudinary.com" in value)


def _extract_cloudinary_public_id(url: str) -> str | None:
    """Best-effort extraction of a Cloudinary public id from a delivery URL."""
    parsed = urlparse(url)
    upload_marker = "/upload/"
    if upload_marker not in parsed.path:
        return None

    _, tail = parsed.path.split(upload_marker, 1)
    segments = [segment for segment in tail.split("/") if segment]
    while segments and (
        (segments[0].startswith("v") and segments[0][1:].isdigit())
        or "," in segments[0]
        or "_" in segments[0]
    ):
        segments.pop(0)

    if not segments:
        return None

    asset_path = "/".join(segments)
    dot_index = asset_path.rfind(".")
    return asset_path[:dot_index] if dot_index > asset_path.rfind("/") else asset_path
