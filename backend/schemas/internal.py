"""Internal-only operation response models."""

from pydantic import BaseModel, ConfigDict, Field


class CleanupEventResult(BaseModel):
    """Per-event cleanup outcome."""

    event_id: str = Field(alias="eventId")
    status: str
    photos_considered: int = Field(alias="photosConsidered")
    cloudinary_deleted: int = Field(alias="cloudinaryDeleted")
    cloudinary_failed: int = Field(alias="cloudinaryFailed")
    user_matches_cleared: int = Field(alias="userMatchesCleared")
    face_index_cleared: int = Field(alias="faceIndexCleared")
    errors: list[str] = []

    model_config = ConfigDict(populate_by_name=True)


class CleanupResponse(BaseModel):
    """Internal cleanup route response."""

    scanned_events: int = Field(alias="scannedEvents")
    cleaned_events: int = Field(alias="cleanedEvents")
    failed_events: int = Field(alias="failedEvents")
    skipped_events: int = Field(alias="skippedEvents")
    results: list[CleanupEventResult]

    model_config = ConfigDict(populate_by_name=True)
