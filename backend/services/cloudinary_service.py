"""Cloudinary upload helpers for event gallery photos."""

from __future__ import annotations

from io import BytesIO
from uuid import uuid4

import cloudinary.uploader

from backend.config import getSettings
from backend.core.cloudinary import configure_cloudinary
from backend.errors import AppError


def upload_event_photo(*, event_id: str, file_name: str, content: bytes) -> dict:
    """Upload one gallery photo to Cloudinary and return gallery-safe metadata."""
    configure_cloudinary()
    settings = getSettings()
    public_id = f"{settings.event_photo_folder}/{event_id}/{uuid4().hex}"

    try:
        response = cloudinary.uploader.upload(
            BytesIO(content),
            public_id=public_id,
            resource_type="image",
            overwrite=False,
            folder=None,
            eager=[
                {"width": 640, "height": 640, "crop": "limit", "quality": "auto", "fetch_format": "auto"},
            ],
            use_filename=False,
            unique_filename=False,
            asset_folder=f"{settings.event_photo_folder}/{event_id}",
            filename_override=file_name,
        )
    except Exception as exc:
        raise AppError("PictureMe could not upload a photo to Cloudinary", code="CLOUDINARY_UPLOAD_FAILED", status=502) from exc

    eager = response.get("eager") or []
    thumbnail_url = eager[0].get("secure_url") if eager else response.get("secure_url")
    return {
        "public_id": response.get("public_id"),
        "cloudinary_url": response.get("secure_url"),
        "thumbnail_url": thumbnail_url,
        "width": response.get("width"),
        "height": response.get("height"),
        "bytes": response.get("bytes"),
        "format": response.get("format"),
    }
