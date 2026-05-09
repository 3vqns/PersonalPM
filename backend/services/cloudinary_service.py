"""Cloudinary helpers for browser and gallery image uploads."""

from __future__ import annotations

import logging
import time
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import cloudinary.api
import cloudinary.uploader
import cloudinary.utils
from fastapi import UploadFile

from backend.config import getSettings
from backend.core.cloudinary import configure_cloudinary
from backend.core.retry import run_with_retries
from backend.errors import AppError
from backend.schemas.upload import CloudinaryUploadToken

logger = logging.getLogger("pictureme.cloudinary")
_ALLOWED_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


async def upload_account_avatar(*, user_id: str, upload: UploadFile) -> str:
    """Upload one user avatar image and return the delivery URL."""
    return await _upload_browser_image(
        upload=upload,
        asset_folder=f"{getSettings().account_avatar_folder}/{user_id}",
        public_id=f"{getSettings().account_avatar_folder}/{user_id}/{uuid4().hex}",
        operation_name="cloudinary.upload_account_avatar",
        max_bytes=getSettings().max_account_avatar_size_bytes,
        upload_error_code="AVATAR_UPLOAD_FAILED",
        upload_error_message="PictureMe could not upload your avatar",
        eager=[
            {"width": 512, "height": 512, "crop": "fill", "gravity": "face", "quality": "auto", "fetch_format": "auto"},
        ],
    )


async def upload_event_cover(*, event_id: str, upload: UploadFile) -> str:
    """Upload one event cover image and return the delivery URL."""
    return await _upload_browser_image(
        upload=upload,
        asset_folder=f"{getSettings().event_cover_folder}/{event_id}",
        public_id=f"{getSettings().event_cover_folder}/{event_id}/{uuid4().hex}",
        operation_name="cloudinary.upload_event_cover",
        max_bytes=getSettings().max_event_cover_size_bytes,
        upload_error_code="EVENT_COVER_UPLOAD_FAILED",
        upload_error_message="PictureMe could not upload the event cover image",
        eager=[
            {"width": 1600, "height": 900, "crop": "fill", "gravity": "auto", "quality": "auto", "fetch_format": "auto"},
        ],
    )


async def upload_face_profile_selfie(*, user_id: str, sort_order: int, upload: UploadFile) -> dict[str, str]:
    """Upload one enrollment selfie and return the stored Cloudinary metadata."""
    settings = getSettings()
    public_id = f"{settings.face_profile_folder}/{user_id}/{sort_order:02d}-{uuid4().hex}"
    secure_url = await _upload_browser_image(
        upload=upload,
        asset_folder=f"{settings.face_profile_folder}/{user_id}",
        public_id=public_id,
        operation_name="cloudinary.upload_face_profile_selfie",
        max_bytes=settings.max_face_profile_selfie_size_bytes,
        upload_error_code="SELFIE_UPLOAD_FAILED",
        upload_error_message="PictureMe could not store your enrollment selfie",
        eager=[],
    )
    return {
        "public_id": public_id,
        "cloudinary_url": secure_url,
    }


_EAGER_TRANSFORMATION = "c_limit,f_auto,h_640,q_auto,w_640"


def generate_event_photo_upload_params(*, event_id: str) -> CloudinaryUploadToken:
    """Return signed Cloudinary upload params the browser can use to upload directly."""
    configure_cloudinary()
    settings = getSettings()
    timestamp = int(time.time())
    folder = f"{settings.event_photo_folder}/{event_id}"

    params_to_sign = {
        "eager": _EAGER_TRANSFORMATION,
        "folder": folder,
        "timestamp": timestamp,
    }
    signature = cloudinary.utils.api_sign_request(params_to_sign, settings.cloudinary_api_secret_value)

    return CloudinaryUploadToken(
        cloudName=settings.cloudinary_cloud_name_value,
        apiKey=settings.cloudinary_api_key_value,
        timestamp=timestamp,
        signature=signature,
        folder=folder,
        eager=_EAGER_TRANSFORMATION,
    )


def upload_event_photo(*, event_id: str, file_name: str, content: bytes) -> dict:
    """Upload one gallery photo to Cloudinary and return gallery-safe metadata."""
    configure_cloudinary()
    settings = getSettings()
    public_id = f"{settings.event_photo_folder}/{event_id}/{uuid4().hex}"

    try:
        response = run_with_retries(
            operation_name="cloudinary.upload_event_photo",
            attempts=settings.external_retry_attempts,
            backoff_seconds=settings.external_retry_backoff_seconds,
            logger=logger,
            func=lambda: cloudinary.uploader.upload(
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
            ),
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
            response = run_with_retries(
                operation_name="cloudinary.delete_event_photo_assets",
                attempts=getSettings().external_retry_attempts,
                backoff_seconds=getSettings().external_retry_backoff_seconds,
                logger=logger,
                func=lambda chunk=chunk: cloudinary.api.delete_resources(chunk, resource_type="image", type="upload"),
            )
        except Exception as exc:
            raise AppError("PictureMe could not delete event photos from Cloudinary", code="CLOUDINARY_DELETE_FAILED", status=502) from exc

        deleted.update(response.get("deleted", {}))

    return deleted


def delete_face_profile_assets(*, public_ids: list[str]) -> dict[str, str]:
    """Delete one or more enrollment selfie assets by Cloudinary public id."""
    try:
        return delete_event_photo_assets(public_ids=public_ids)
    except AppError as exc:
        raise AppError("PictureMe could not delete your enrollment selfies", code="SELFIE_DELETE_FAILED", status=500) from exc


async def _upload_browser_image(
    *,
    upload: UploadFile,
    asset_folder: str,
    public_id: str,
    operation_name: str,
    max_bytes: int,
    upload_error_code: str,
    upload_error_message: str,
    eager: list[dict],
) -> str:
    """Validate and upload one user-supplied image asset."""
    content_type = upload.content_type or ""
    if content_type not in _ALLOWED_IMAGE_CONTENT_TYPES:
        raise AppError(
            "Image uploads must be JPEG, PNG, WebP, or HEIC files",
            code="INVALID_IMAGE_TYPE",
            status=422,
            details={"contentType": content_type or None},
        )

    content = await upload.read()
    if not content:
        raise AppError("Image upload was empty", code="INVALID_IMAGE", status=422)
    if len(content) > max_bytes:
        raise AppError(
            "Image upload exceeds the allowed file size",
            code="IMAGE_TOO_LARGE",
            status=422,
            details={"maxBytes": max_bytes, "receivedBytes": len(content)},
        )

    configure_cloudinary()
    filename = upload.filename or f"{uuid4().hex}{Path(public_id).suffix or '.jpg'}"

    try:
        response = run_with_retries(
            operation_name=operation_name,
            attempts=getSettings().external_retry_attempts,
            backoff_seconds=getSettings().external_retry_backoff_seconds,
            logger=logger,
            func=lambda: cloudinary.uploader.upload(
                BytesIO(content),
                public_id=public_id,
                resource_type="image",
                overwrite=False,
                folder=None,
                eager=eager,
                use_filename=False,
                unique_filename=False,
                asset_folder=asset_folder,
                filename_override=filename,
            ),
        )
    except Exception as exc:
        raise AppError(upload_error_message, code=upload_error_code, status=502) from exc

    return response.get("secure_url") or ""
