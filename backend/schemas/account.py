"""Account and face-profile request/response models."""

from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class AccountUserResponse(BaseModel):
    """Frontend-facing account user payload."""

    id: str
    email: str
    name: str
    avatar_url: str | None = Field(default=None, alias="avatarUrl")
    has_face_profile: bool = Field(alias="hasFaceProfile")
    face_indexed_at: datetime | None = Field(default=None, alias="faceIndexedAt")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AccountResponse(BaseModel):
    """Account route response contract."""

    user: AccountUserResponse

    model_config = ConfigDict(
        populate_by_name=True,
    )


class FaceProfileStatusResponse(BaseModel):
    """Face-profile lifecycle response contract."""

    has_face_profile: bool = Field(alias="hasFaceProfile")
    indexed_at: datetime | None = Field(default=None, alias="indexedAt")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class PublicUserRecord(BaseModel):
    """Normalized `public.users` row used inside backend services."""

    id: str
    email: str
    name: str
    avatar_url: str | None = None
    face_indexed_at: datetime | None = None
    rekognition_face_id: str | None = None

    @property
    def has_face_profile(self) -> bool:
        return self.face_indexed_at is not None or self.rekognition_face_id is not None


class FaceProfileImageRecord(BaseModel):
    """Normalized row for stored enrollment selfie metadata."""

    id: str
    user_id: str
    storage_path: str
    cloudinary_id: str | None = None
    cloudinary_url: str | None = None
    sort_order: int
    created_at: datetime | None = None

    @property
    def inferred_content_type(self) -> str | None:
        source = self.cloudinary_url or self.storage_path
        extension = Path(source).suffix.lower()
        if extension in {".jpg", ".jpeg"}:
            return "image/jpeg"
        if extension == ".png":
            return "image/png"
        if extension == ".webp":
            return "image/webp"
        if extension in {".heic", ".heif"}:
            return "image/heic"
        return None
