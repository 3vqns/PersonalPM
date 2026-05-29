"""Photo upload request, staging, and progress models."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

UploadJobStatus = Literal["queued", "uploading", "indexing", "completed", "failed"]
UploadFileStatus = Literal["queued", "uploading", "uploaded", "indexing", "completed", "failed"]


class UploadJobStartResponse(BaseModel):
    """Immediate response returned after accepting an upload batch."""

    job_id: str = Field(alias="jobId")

    model_config = ConfigDict(populate_by_name=True)


class UploadJobProgressResponse(BaseModel):
    """Frontend-facing job progress snapshot."""

    job_id: str = Field(alias="jobId")
    event_id: str = Field(alias="eventId")
    total_files: int = Field(alias="totalFiles")
    uploaded_files: int = Field(alias="uploadedFiles")
    indexed_files: int = Field(alias="indexedFiles")
    failed_files: int = Field(alias="failedFiles")
    current_file_name: str | None = Field(default=None, alias="currentFileName")
    status: UploadJobStatus

    model_config = ConfigDict(populate_by_name=True)


class UploadJobRecord(BaseModel):
    """Normalized upload batch row stored in Supabase."""

    id: str
    event_id: str
    created_by: str
    total_files: int
    uploaded_files: int
    indexed_files: int
    failed_files: int
    current_file_name: str | None = None
    status: UploadJobStatus
    created_at: datetime | None = None
    updated_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class UploadJobFileRecord(BaseModel):
    """Normalized per-file progress row stored in Supabase."""

    id: str
    job_id: str
    event_id: str
    file_name: str
    content_type: str
    byte_size: int
    status: UploadFileStatus
    photo_id: str | None = None
    cloudinary_public_id: str | None = None
    cloudinary_url: str | None = None
    thumbnail_url: str | None = None
    face_count: int = 0
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class StagedUploadFile(BaseModel):
    """Validated in-memory upload file staged for background processing."""

    file_name: str
    content_type: str
    byte_size: int
    content: bytes


class CloudinaryUploadToken(BaseModel):
    """Signed Cloudinary upload params returned to the browser for direct upload."""

    cloud_name: str = Field(alias="cloudName")
    api_key: str = Field(alias="apiKey")
    timestamp: int
    signature: str
    folder: str
    eager: str

    model_config = ConfigDict(populate_by_name=True)


class DirectUploadPhoto(BaseModel):
    """One photo successfully uploaded directly from the browser to Cloudinary."""

    public_id: str = Field(alias="publicId")
    original_filename: str = Field(alias="originalFilename")
    cloudinary_url: str = Field(alias="cloudinaryUrl")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")
    width: int | None = None
    height: int | None = None
    bytes: int | None = None
    format: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class IndexPhotosRequest(BaseModel):
    """Request body for the direct-upload index endpoint."""

    photos: list[DirectUploadPhoto]
