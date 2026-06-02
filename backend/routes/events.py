"""Dashboard, event lifecycle, membership, and join-flow routes."""

import json

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from pydantic import ValidationError

from backend.dependencies.auth import AuthenticatedUser, get_optional_authenticated_user, require_authenticated_user
from backend.errors import AppError
from backend.schemas.event import (
    DashboardResponse,
    EventCreateRequest,
    EventCreateResponse,
    EventDetailResponse,
    EventPeopleResponse,
    EventJoinResponse,
    EventMemberResponse,
    EventMemberRoleUpdateRequest,
    EventUpdateRequest,
    GalleryAccessRequest,
    GalleryAccessRequestResponse,
    GalleryAccessResponse,
    GalleryAccessStatusUpdateRequest,
    JoinPreviewResponse,
    PublicEventGalleryResponse,
)
from backend.schemas.upload import CloudinaryUploadToken, IndexPhotosRequest, UploadJobStartResponse
from backend.services.event_service import (
    create_event,
    delete_event,
    get_dashboard,
    get_event_detail,
    invite_gallery_access_by_email,
    get_join_preview,
    get_public_event_gallery,
    join_event,
    list_event_people,
    list_gallery_access,
    list_event_members,
    remove_gallery_access,
    request_gallery_access,
    update_event,
    update_gallery_access_status,
    update_event_member_role,
)
from backend.services.photo_upload_service import delete_event_photo, get_event_upload_token, index_direct_uploads, start_event_upload_batch

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
    tags: str = Form(default="[]"),
    allow_anyone_upload: bool = Form(default=False),
    private_gallery: bool = Form(default=False),
    cover: UploadFile | None = File(default=None),
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> EventCreateResponse:
    """Create an event and its Rekognition collection."""
    payload = _parse_event_create_payload(
        name=name,
        date=date,
        description=description,
        tags=tags,
        allow_anyone_upload=allow_anyone_upload,
        private_gallery=private_gallery,
    )
    if payload.date is None or payload.name is None:
        raise AppError("Missing required event fields", code="VALIDATION_ERROR", status=422)
    return await create_event(
        current_user,
        name=payload.name,
        date_value=payload.date,
        description=payload.description,
        tags=payload.tags,
        allow_anyone_upload=payload.allow_anyone_upload,
        private_gallery=payload.private_gallery,
        cover=cover,
    )


@router.get("/api/events/join/{token}", response_model=JoinPreviewResponse)
async def get_event_join_preview(
    token: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_authenticated_user),
) -> JoinPreviewResponse:
    """Return a public-safe event join preview."""
    return get_join_preview(token, current_user=current_user)


@router.get("/api/events/join/{token}/gallery", response_model=PublicEventGalleryResponse)
async def get_event_public_gallery(
    token: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_authenticated_user),
) -> PublicEventGalleryResponse:
    """Return the public event gallery for an invite token."""
    return get_public_event_gallery(token, current_user=current_user)


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


@router.get("/api/events/{event_id}/people", response_model=EventPeopleResponse)
async def get_people(
    event_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> EventPeopleResponse:
    """Return signed-in event members and anonymous uploaders."""
    return list_event_people(current_user, event_id=event_id)


@router.post("/api/events/{event_id}/access-requests", response_model=GalleryAccessRequestResponse)
async def post_gallery_access_request(
    event_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> GalleryAccessRequestResponse:
    """Request access to a private gallery."""
    return request_gallery_access(current_user, event_id=event_id)


@router.get("/api/events/{event_id}/gallery-access", response_model=list[GalleryAccessResponse])
async def get_gallery_access(
    event_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> list[GalleryAccessResponse]:
    """Return private-gallery access rows. Creator only."""
    return list_gallery_access(current_user, event_id=event_id)


@router.post("/api/events/{event_id}/gallery-access", response_model=GalleryAccessResponse)
async def post_gallery_access(
    event_id: str,
    payload: GalleryAccessRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> GalleryAccessResponse:
    """Approve private-gallery access for an existing user by email."""
    return invite_gallery_access_by_email(current_user, event_id=event_id, email=payload.email)


@router.patch("/api/events/{event_id}/gallery-access/{user_id}", response_model=GalleryAccessResponse)
async def patch_gallery_access(
    event_id: str,
    user_id: str,
    payload: GalleryAccessStatusUpdateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> GalleryAccessResponse:
    """Approve or move gallery access back to pending. Creator only."""
    return update_gallery_access_status(current_user, event_id=event_id, user_id=user_id, status=payload.status)


@router.delete("/api/events/{event_id}/gallery-access/{user_id}")
async def delete_gallery_access(
    event_id: str,
    user_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict[str, bool]:
    """Remove one user's private-gallery access. Creator only."""
    return remove_gallery_access(current_user, event_id=event_id, user_id=user_id)


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
    uploader_name: str | None = Form(default=None),
    current_user: AuthenticatedUser | None = Depends(get_optional_authenticated_user),
) -> UploadJobStartResponse:
    """Accept an admin upload batch and process it asynchronously."""
    return await start_event_upload_batch(
        current_user,
        event_id=event_id,
        files=photos,
        background_tasks=background_tasks,
        uploader_name=uploader_name,
    )


@router.post("/api/events/{event_id}/upload-token", response_model=CloudinaryUploadToken)
async def post_upload_token(
    event_id: str,
    current_user: AuthenticatedUser | None = Depends(get_optional_authenticated_user),
) -> CloudinaryUploadToken:
    """Return signed Cloudinary upload params so the browser can upload photos directly."""
    return get_event_upload_token(current_user, event_id=event_id)


@router.post("/api/events/{event_id}/photos/index", response_model=UploadJobStartResponse)
async def post_index_photos(
    event_id: str,
    payload: IndexPhotosRequest,
    background_tasks: BackgroundTasks,
    current_user: AuthenticatedUser | None = Depends(get_optional_authenticated_user),
) -> UploadJobStartResponse:
    """Accept references to photos already uploaded to Cloudinary and index them asynchronously."""
    return index_direct_uploads(
        current_user,
        event_id=event_id,
        photos=payload.photos,
        background_tasks=background_tasks,
        uploader_name=payload.uploader_name,
    )


@router.delete("/api/events/{event_id}/photos/{photo_id}")
async def remove_event_photo(
    event_id: str,
    photo_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict[str, bool]:
    """Delete one event photo. Admins and creators may do this."""
    return delete_event_photo(current_user, event_id=event_id, photo_id=photo_id)


def _parse_event_create_payload(
    *,
    name: str,
    date: str,
    description: str | None,
    tags: str,
    allow_anyone_upload: bool,
    private_gallery: bool,
) -> EventCreateRequest:
    try:
        parsed_tags = json.loads(tags or "[]")
    except json.JSONDecodeError as exc:
        raise AppError("Event tags must be a JSON array", code="VALIDATION_ERROR", status=422) from exc

    try:
        return EventCreateRequest(
            name=name,
            date=date,
            description=description,
            tags=parsed_tags,
            allow_anyone_upload=allow_anyone_upload,
            private_gallery=private_gallery,
        )
    except ValidationError as exc:
        raise AppError("Invalid event fields", code="VALIDATION_ERROR", status=422, details={"errors": exc.errors()}) from exc
