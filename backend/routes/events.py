"""Dashboard, event lifecycle, membership, and join-flow routes."""

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile

from backend.dependencies.auth import AuthenticatedUser, get_optional_authenticated_user, require_authenticated_user
from backend.errors import AppError
from backend.schemas.event import (
    DashboardResponse,
    EventCreateResponse,
    EventDetailResponse,
    EventJoinResponse,
    EventMemberResponse,
    EventMemberRoleUpdateRequest,
    EventUpdateRequest,
    JoinPreviewResponse,
)
from backend.schemas.upload import UploadJobStartResponse
from backend.services.event_service import (
    create_event,
    delete_event,
    get_dashboard,
    get_event_detail,
    get_join_preview,
    join_event,
    list_event_members,
    update_event,
    update_event_member_role,
)
from backend.services.photo_upload_service import start_event_upload_batch

router = APIRouter(tags=["events"])


@router.get("/api/dashboard", response_model=DashboardResponse)
async def get_current_dashboard(
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> DashboardResponse:
    """Return the authenticated user's dashboard aggregates."""
    return get_dashboard(current_user)


@router.post("/api/events", response_model=EventCreateResponse)
async def post_event(
    name: str = Form(...),
    date: str = Form(...),
    description: str | None = Form(default=None),
    cover: UploadFile | None = File(default=None),
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> EventCreateResponse:
    """Create an event and its Rekognition collection."""
    if cover is not None and cover.filename:
        raise AppError("Cover photo uploads are not implemented yet", code="COVER_UPLOAD_NOT_IMPLEMENTED", status=501)

    payload = EventUpdateRequest(name=name, date=date, description=description)
    if payload.date is None or payload.name is None:
        raise AppError("Missing required event fields", code="VALIDATION_ERROR", status=422)
    return create_event(current_user, name=payload.name, date_value=payload.date, description=payload.description)


@router.get("/api/events/join/{token}", response_model=JoinPreviewResponse)
async def get_event_join_preview(
    token: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_authenticated_user),
) -> JoinPreviewResponse:
    """Return a public-safe event join preview."""
    return get_join_preview(token, current_user=current_user)


@router.post("/api/events/{event_id}/join", response_model=EventJoinResponse)
async def post_join_event(
    event_id: str,
    background_tasks: BackgroundTasks,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> EventJoinResponse:
    """Join an event and kick off async matching later if the user has a face profile."""
    return join_event(current_user, event_id=event_id, background_tasks=background_tasks)


@router.get("/api/events/{event_id}", response_model=EventDetailResponse)
async def get_event(
    event_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> EventDetailResponse:
    """Return one event detail payload for an authorized creator or member."""
    return get_event_detail(current_user, event_id=event_id)


@router.patch("/api/events/{event_id}", response_model=EventDetailResponse)
async def patch_event(
    event_id: str,
    payload: EventUpdateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> EventDetailResponse:
    """Update one event's editable fields."""
    return update_event(current_user, event_id=event_id, payload=payload)


@router.delete("/api/events/{event_id}", status_code=204)
async def remove_event(
    event_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> None:
    """Delete an event. Only the creator may do this."""
    delete_event(current_user, event_id=event_id)


@router.get("/api/events/{event_id}/members", response_model=list[EventMemberResponse])
async def get_members(
    event_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> list[EventMemberResponse]:
    """Return the member list for an event member or creator."""
    return list_event_members(current_user, event_id=event_id)


@router.patch("/api/events/{event_id}/members/{user_id}")
async def patch_event_member_role(
    event_id: str,
    user_id: str,
    payload: EventMemberRoleUpdateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict[str, bool]:
    """Update a member role. Only the creator may do this."""
    return update_event_member_role(current_user, event_id=event_id, member_user_id=user_id, role=payload.role)


@router.post("/api/events/{event_id}/photos", response_model=UploadJobStartResponse)
async def post_event_photos(
    event_id: str,
    background_tasks: BackgroundTasks,
    photos: list[UploadFile] = File(...),
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> UploadJobStartResponse:
    """Accept an admin upload batch and process it asynchronously."""
    return await start_event_upload_batch(
        current_user,
        event_id=event_id,
        files=photos,
        background_tasks=background_tasks,
    )
