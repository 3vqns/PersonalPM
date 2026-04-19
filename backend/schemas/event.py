"""Event, dashboard, membership, and join-flow request/response models."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.schemas.account import AccountUserResponse

EventRole = Literal["creator", "admin", "member"]
EventStatus = Literal["active", "expired"]


class CreatorSummary(BaseModel):
    """Minimal creator payload for event responses."""

    id: str
    name: str


class EventSummaryResponse(BaseModel):
    """Dashboard event card payload."""

    id: str
    name: str
    date: date
    cover_url: str | None = Field(default=None, alias="coverUrl")
    host_name: str | None = Field(default=None, alias="hostName")
    photo_count: int = Field(alias="photoCount")
    member_count: int = Field(alias="memberCount")
    my_photos_count: int | None = Field(default=None, alias="myPhotosCount")
    days_remaining: int = Field(alias="daysRemaining")
    status: EventStatus
    role: EventRole

    model_config = ConfigDict(populate_by_name=True)


class DashboardResponse(BaseModel):
    """Dashboard aggregate payload."""

    user: AccountUserResponse
    created_events: list[EventSummaryResponse] = Field(alias="createdEvents")
    joined_events: list[EventSummaryResponse] = Field(alias="joinedEvents")

    model_config = ConfigDict(populate_by_name=True)


class EventCountsResponse(BaseModel):
    """Per-event derived counts."""

    all_photos: int = Field(alias="allPhotos")
    my_photos: int = Field(alias="myPhotos")
    members: int

    model_config = ConfigDict(populate_by_name=True)


class EventDetailResponse(BaseModel):
    """Detailed event payload used by gallery and settings screens."""

    id: str
    name: str
    description: str | None = None
    date: date
    expires_at: datetime = Field(alias="expiresAt")
    status: EventStatus
    cover_url: str | None = Field(default=None, alias="coverUrl")
    join_token: str = Field(alias="joinToken")
    role: EventRole
    creator: CreatorSummary
    counts: EventCountsResponse

    model_config = ConfigDict(populate_by_name=True)


class EventCreateResponse(BaseModel):
    """Response for successful event creation."""

    id: str


class JoinPreviewResponse(BaseModel):
    """Public-safe event invite preview."""

    id: str
    name: str
    date: date
    host_name: str = Field(alias="hostName")
    cover_url: str | None = Field(default=None, alias="coverUrl")
    photo_count: int = Field(alias="photoCount")
    member_count: int = Field(alias="memberCount")
    status: EventStatus
    expires_at: datetime = Field(alias="expiresAt")
    join_token: str = Field(alias="joinToken")
    already_joined: bool | None = Field(default=None, alias="alreadyJoined")

    model_config = ConfigDict(populate_by_name=True)


class EventMemberResponse(BaseModel):
    """Event member list row."""

    id: str
    user_id: str = Field(alias="userId")
    name: str
    email: str
    role: EventRole
    joined_at: datetime = Field(alias="joinedAt")
    avatar_url: str | None = Field(default=None, alias="avatarUrl")

    model_config = ConfigDict(populate_by_name=True)


class EventUpdateRequest(BaseModel):
    """Editable event fields."""

    name: str | None = Field(default=None, max_length=120)
    date: date | None = None
    description: str | None = Field(default=None, max_length=2000)


class EventMemberRoleUpdateRequest(BaseModel):
    """Allowed creator-managed role updates."""

    role: Literal["admin", "member"]


class EventJoinResponse(BaseModel):
    """Join result payload."""

    event_id: str = Field(alias="eventId")
    already_joined: bool = Field(alias="alreadyJoined")
    role: EventRole

    model_config = ConfigDict(populate_by_name=True)


class EventRecord(BaseModel):
    """Normalized `events` row used inside backend services."""

    id: str
    creator_id: str
    name: str
    description: str | None = None
    date: date
    expires_at: datetime
    join_token: str
    rekognition_collection_id: str
    cover_url: str | None = None
    status: EventStatus
    created_at: datetime


class EventMemberRecord(BaseModel):
    """Normalized `event_members` row."""

    id: str
    event_id: str
    user_id: str
    role: EventRole
    joined_at: datetime


class PhotoResponse(BaseModel):
    """Gallery photo payload."""

    id: str
    cloudinary_url: str = Field(alias="cloudinaryUrl")
    thumbnail_url: str | None = Field(default=None, alias="thumbnailUrl")
    uploaded_at: datetime = Field(alias="uploadedAt")
    face_count: int = Field(alias="faceCount")

    model_config = ConfigDict(populate_by_name=True)


class MatchedPhotoResponse(PhotoResponse):
    """Matched photo payload for user-scoped galleries."""

    matched_at: datetime | None = Field(default=None, alias="matchedAt")
    similarity_score: float | None = Field(default=None, alias="similarityScore")


class AllPhotosResponse(BaseModel):
    """Full event gallery response."""

    photos: list[PhotoResponse]


class MyPhotosResponse(BaseModel):
    """Current-user matched gallery response."""

    photos: list[MatchedPhotoResponse]
    download_all_url: str | None = Field(default=None, alias="downloadAllUrl")
    has_face_profile: bool = Field(alias="hasFaceProfile")

    model_config = ConfigDict(populate_by_name=True)


class SharedGalleryEventResponse(BaseModel):
    """Public shared gallery event summary."""

    id: str
    name: str
    date: date


class SharedGalleryOwnerResponse(BaseModel):
    """Public shared gallery owner summary."""

    id: str
    name: str
    avatar_url: str | None = Field(default=None, alias="avatarUrl")

    model_config = ConfigDict(populate_by_name=True)


class GalleryResponse(BaseModel):
    """Public tokenized gallery response."""

    event: SharedGalleryEventResponse
    shared_by: SharedGalleryOwnerResponse = Field(alias="sharedBy")
    photos: list[MatchedPhotoResponse]
    download_all_url: str | None = Field(default=None, alias="downloadAllUrl")

    model_config = ConfigDict(populate_by_name=True)


class GalleryTokenCreateRequest(BaseModel):
    """Create or reuse a share token scoped to one user and one event."""

    event_id: str = Field(alias="eventId", min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class ShareGalleryTokenResponse(BaseModel):
    """Share-token creation response."""

    token: str
    url: str


class GalleryTokenRecord(BaseModel):
    """Normalized `gallery_tokens` row."""

    token: str
    user_id: str
    event_id: str
    created_at: datetime | None = None


class PhotoRecord(BaseModel):
    """Normalized `photos` row."""

    id: str
    event_id: str
    cloudinary_url: str | None = None
    thumbnail_url: str | None = None
    uploaded_at: datetime
    face_count: int


class UserPhotoMatchRecord(BaseModel):
    """Normalized `user_photo_matches` row."""

    id: str | None = None
    user_id: str
    photo_id: str
    event_id: str
    similarity_score: float | None = None
    matched_at: datetime | None = None
