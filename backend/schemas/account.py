"""Account and face-profile request/response models."""

from datetime import datetime

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
    storage_bucket: str
    storage_path: str
    content_type: str
    byte_size: int
    sort_order: int
    created_at: datetime
