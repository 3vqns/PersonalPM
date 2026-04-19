"""Cloudinary helpers for event gallery photos."""

from __future__ import annotations

from io import BytesIO
from uuid import uuid4

import cloudinary.api
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


def delete_event_photo_assets(*, public_ids: list[str]) -> dict[str, str]:
    """Delete one or more uploaded event photo assets by Cloudinary public id."""
    configure_cloudinary()
    deleted: dict[str, str] = {}

    for chunk_start in range(0, len(public_ids), 100):
        chunk = public_ids[chunk_start:chunk_start + 100]
        if not chunk:
            continue

        try:
            response = cloudinary.api.delete_resources(chunk, resource_type="image", type="upload")
        except Exception as exc:
            raise AppError("PictureMe could not delete event photos from Cloudinary", code="CLOUDINARY_DELETE_FAILED", status=502) from exc

        deleted.update(response.get("deleted", {}))

    return deleted
