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

    name: str | None = None
    date: date | None = None
    description: str | None = None


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
