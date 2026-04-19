"""Backend-owned account and face-profile lifecycle services."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4

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
from backend.services.cloudinary_service import upload_account_avatar
from backend.services.matching_service import trigger_user_active_event_rematch

logger = logging.getLogger("pictureme.account")
_ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
_MIN_ENROLLMENT_SELFIES = 3
_MAX_ENROLLMENT_SELFIES = 5


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
        _delete_storage_paths([asset["storage_path"] for asset in uploaded_assets])
        raise

    client = get_supabase_admin_client()
    updated_at = datetime.now(timezone.utc)

    try:
        client.table("face_profile_images").delete().eq("user_id", current_user.user_id).execute()
        client.table("face_profile_images").insert(uploaded_assets).execute()
        client.table("users").update(
            {
                "face_profile_completed": True,
                "face_profile_updated_at": updated_at.isoformat(),
            }
        ).eq("id", current_user.user_id).execute()
        _clear_user_matches(current_user.user_id)
    except Exception as exc:
        _delete_storage_paths([asset["storage_path"] for asset in uploaded_assets])
        raise AppError("PictureMe could not save your face profile", code="FACE_PROFILE_SAVE_FAILED", status=500) from exc

    if existing_assets:
        _delete_storage_paths([asset.storage_path for asset in existing_assets], suppress_errors=True)

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
    paths_to_delete = [asset.storage_path for asset in existing_assets]
    if paths_to_delete:
        _delete_storage_paths(paths_to_delete)

    client = get_supabase_admin_client()
    try:
        _clear_user_matches(current_user.user_id)
        client.table("face_profile_images").delete().eq("user_id", current_user.user_id).execute()
        client.table("users").update(
            {
                "face_profile_completed": False,
                "face_profile_updated_at": None,
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
            hasFaceProfile=user_record.face_profile_completed,
            faceIndexedAt=user_record.face_profile_updated_at,
        )
    )


def get_public_user_record(current_user: AuthenticatedUser) -> PublicUserRecord:
    """Fetch the current public user row, creating it from auth data if missing."""
    client = get_supabase_admin_client()

    try:
        response = client.table("users").select(
            "id,email,name,avatar_url,face_profile_completed,face_profile_updated_at"
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
                "face_profile_completed": False,
                "face_profile_updated_at": None,
            }
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not provision your account", code="ACCOUNT_PROVISION_FAILED", status=500) from exc

    return PublicUserRecord(
        id=current_user.user_id,
        email=current_user.email or current_user.raw_user.get("email") or "",
        name=auth_name,
        avatar_url=auth_avatar_url,
        face_profile_completed=False,
        face_profile_updated_at=None,
    )


def _list_face_profile_images(user_id: str) -> list[FaceProfileImageRecord]:
    """Fetch the current stored enrollment selfie metadata for a user."""
    client = get_supabase_admin_client()
    try:
        response = client.table("face_profile_images").select(
            "id,user_id,storage_bucket,storage_path,content_type,byte_size,sort_order,created_at"
        ).eq("user_id", user_id).order("sort_order").execute()
    except Exception as exc:
        raise AppError("PictureMe could not load your face profile", code="FACE_PROFILE_FETCH_FAILED", status=500) from exc

    rows = response.data or []
    return [FaceProfileImageRecord.model_validate(row) for row in rows]


async def _upload_enrollment_selfie(user_id: str, selfie: UploadFile, sort_order: int) -> dict:
    """Validate and upload one enrollment selfie into the private bucket."""
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

    settings = getSettings()
    path = _build_storage_path(user_id, sort_order, selfie.filename)
    try:
        get_supabase_admin_client().storage.from_(settings.face_profile_bucket).upload(
            path=path,
            file=BytesIO(content),
            file_options={"content-type": content_type, "upsert": "false"},
        )
    except Exception as exc:
        raise AppError("PictureMe could not store your enrollment selfie", code="SELFIE_UPLOAD_FAILED", status=500) from exc

    return {
        "user_id": user_id,
        "storage_bucket": settings.face_profile_bucket,
        "storage_path": path,
        "content_type": content_type,
        "byte_size": len(content),
        "sort_order": sort_order,
    }


def _build_storage_path(user_id: str, sort_order: int, original_filename: str | None) -> str:
    """Create a collision-resistant private storage path for a selfie asset."""
    extension = Path(original_filename or "selfie.jpg").suffix.lower() or ".jpg"
    return f"users/{user_id}/face-profile/{sort_order:02d}-{uuid4().hex}{extension}"


def _clear_user_matches(user_id: str) -> None:
    """Delete dependent match rows for a user."""
    try:
        get_supabase_admin_client().table("user_photo_matches").delete().eq("user_id", user_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not clear your existing matches", code="MATCH_CLEANUP_FAILED", status=500) from exc


def _delete_storage_paths(paths: list[str], *, suppress_errors: bool = False) -> None:
    """Delete one or more files from the private face-profile storage bucket."""
    if not paths:
        return

    settings = getSettings()
    try:
        get_supabase_admin_client().storage.from_(settings.face_profile_bucket).remove(paths)
    except Exception as exc:
        if suppress_errors:
            logger.warning("Failed to delete replaced face-profile assets", extra={"paths": paths})
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
