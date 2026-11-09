"""Private enrollment selfie storage through the backend service role."""

from uuid import uuid4

from backend.config import getSettings
from backend.core.supabase_admin import get_supabase_admin_client
from backend.errors import AppError


def store_enrollment_selfie(*, userId: str, sortOrder: int, content: bytes, contentType: str) -> str:
    extension = ".png" if contentType == "image/png" else ".jpg"
    storagePath = f"{userId}/{sortOrder:02d}-{uuid4().hex}{extension}"
    try:
        get_supabase_admin_client().storage.from_(getSettings().face_profile_bucket).upload(
            path=storagePath,
            file=content,
            file_options={"content-type": contentType, "upsert": "false"},
        )
    except Exception as exc:
        raise AppError("PictureMe could not store your enrollment selfie", code="SELFIE_UPLOAD_FAILED", status=502) from exc
    return storagePath
