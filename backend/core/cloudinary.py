"""Shared Cloudinary client configuration."""

from functools import lru_cache

import cloudinary

from backend.config import getSettings


@lru_cache
def configure_cloudinary() -> None:
    """Configure the global Cloudinary SDK once for backend uploads."""
    settings = getSettings()
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key_value,
        api_secret=settings.cloudinary_api_secret_value,
        secure=True,
    )
