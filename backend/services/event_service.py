"""Backend-owned event lifecycle, dashboard, join flow, and permissions."""

from __future__ import annotations

import logging
import secrets
from datetime import date, datetime, timezone

from fastapi import BackgroundTasks, UploadFile

from backend.config import getSettings
from backend.core.retry import run_with_retries
from backend.core.rekognition import get_rekognition_client
from backend.core.supabase_admin import get_supabase_admin_client
from backend.core.supabase_response import get_first_row
from backend.dependencies.auth import AuthenticatedUser
from backend.errors import AppError
from backend.schemas.account import AccountUserResponse, PublicUserRecord
from backend.schemas.event import (
    CreatorSummary,
    DashboardResponse,
    EventCreateResponse,
    EventDetailResponse,
    EventPeopleResponse,
    EventJoinResponse,
    EventMemberRecord,
    EventMemberPreviewResponse,
    EventMemberResponse,
    EventPersonResponse,
    EventRecord,
    EventRole,
    EventSummaryResponse,
    EventUpdateRequest,
    GalleryAccessRequestResponse,
    GalleryAccessResponse,
    GalleryAccessStatus,
    GalleryAccessUserResponse,
    JoinPreviewResponse,
    PhotoResponse,
    PhotoRecord,
    PublicEventGalleryResponse,
)
from backend.services.account_service import get_public_user_record
from backend.services.cloudinary_service import upload_event_cover
from backend.services.matching_service import trigger_user_event_match

logger = logging.getLogger("pictureme.events")
_EVENT_SELECT_COLUMNS = (
    "id,creator_id,name,description,date,join_token,rekognition_collection_id,"
    "cover_url,status,created_at,tags,allow_anyone_upload,private_gallery,location"
)


def get_dashboard(current_user: AuthenticatedUser) -> DashboardResponse:
    """Return created and joined event summaries for the current user."""
    public_user = get_public_user_record(current_user)
    created_events = _list_events_by_creator(current_user.user_id)
    memberships = _list_memberships_by_user(current_user.user_id)
    joined_event_ids = [
        membership.event_id
        for membership in memberships
        if all(event.id != membership.event_id for event in created_events)
    ]
    joined_events = _list_events_by_ids(joined_event_ids) if joined_event_ids else []

    summaries = _build_event_summaries(current_user.user_id, [*created_events, *joined_events])
    return DashboardResponse(
        user=_map_account_user(public_user),
        createdEvents=[summary for summary in summaries if summary.role == "creator"],
        joinedEvents=[summary for summary in summaries if summary.role != "creator"],
    )


async def create_event(
    current_user: AuthenticatedUser,
    *,
    name: str,
    date_value: date,
    description: str | None,
    location: str = "TBD",
    tags: list[str] | None = None,
    allow_anyone_upload: bool = False,
    private_gallery: bool = False,
    cover: UploadFile | None = None,
) -> EventCreateResponse:
    """Create an event, its creator membership, and its Rekognition collection."""
    creator = get_public_user_record(current_user)
    cleaned_name = name.strip()
    if not cleaned_name:
        raise AppError("An event name is required", code="VALIDATION_ERROR", status=422)
    cleaned_location = _clean_location(location)

    settings = getSettings()
    join_token = _generate_join_token()
    collection_id = f"{settings.rekognition_collection_prefix}-{secrets.token_hex(8)}"

    try:
        run_with_retries(
            operation_name="rekognition.create_collection",
            attempts=settings.external_retry_attempts,
            backoff_seconds=settings.external_retry_backoff_seconds,
            logger=logger,
            func=lambda: get_rekognition_client().create_collection(CollectionId=collection_id),
        )
    except Exception as exc:
        raise AppError("PictureMe could not create the event collection", code="REKOGNITION_CREATE_FAILED", status=502) from exc

    client = get_supabase_admin_client()
    event_id: str | None = None

    try:
        response = client.table("events").insert(
            {
                "creator_id": creator.id,
                "name": cleaned_name,
                "description": description.strip() if description else None,
                "date": date_value.isoformat(),
                "location": cleaned_location,
                "tags": _normalize_tags(tags),
                "allow_anyone_upload": allow_anyone_upload,
                "private_gallery": private_gallery,
                "join_token": join_token,
                "rekognition_collection_id": collection_id,
                "status": "active",
            }
        ).execute()
        created_event = get_first_row(response.data)
        if not created_event or not created_event.get("id"):
            raise AppError("PictureMe could not create the event", code="EVENT_CREATE_FAILED", status=500)
        event_id = str(created_event["id"])
        client.table("event_members").upsert(
            {
                "event_id": event_id,
                "user_id": creator.id,
                "role": "creator",
            },
            on_conflict="event_id,user_id",
        ).execute()

        if await _has_upload_content(cover):
            cover_url = await upload_event_cover(event_id=event_id, upload=cover)
            if not cover_url:
                raise AppError("PictureMe could not upload the event cover image", code="EVENT_COVER_UPLOAD_FAILED", status=502)
            client.table("events").update({"cover_url": cover_url}).eq("id", event_id).execute()
    except Exception as exc:
        if event_id is not None:
            try:
                client.table("event_members").delete().eq("event_id", event_id).execute()
            except Exception:
                logger.warning("Failed to roll back creator membership for event %s after creation failure", event_id)
            try:
                client.table("events").delete().eq("id", event_id).execute()
            except Exception:
                logger.warning("Failed to roll back event %s after creator membership creation failed", event_id)
        _delete_rekognition_collection(collection_id, suppress_not_found=True)
        if isinstance(exc, AppError):
            raise exc
        raise AppError("PictureMe could not create the event", code="EVENT_CREATE_FAILED", status=500) from exc

    return EventCreateResponse(id=event_id)


async def _has_upload_content(upload: UploadFile | None) -> bool:
    """Return whether an optional browser upload actually contains file bytes."""
    if upload is None or not upload.filename:
        return False

    chunk = await upload.read(1)
    await upload.seek(0)
    return bool(chunk)


def get_event_detail(current_user: AuthenticatedUser, *, event_id: str) -> EventDetailResponse:
    """Return event details for a creator or member."""
    event = _get_event_or_404(event_id)
    role = _require_event_role(current_user.user_id, event)
    creator = _get_public_user_by_id(event.creator_id)

    return _build_event_detail(event, current_user.user_id, role, creator)


def update_event(current_user: AuthenticatedUser, *, event_id: str, payload: EventUpdateRequest) -> EventDetailResponse:
    """Update event metadata. Only the creator may edit event settings."""
    event = _get_event_or_404(event_id)
    _require_creator(current_user.user_id, event)

    update_payload: dict[str, object] = {}
    if payload.name is not None:
        cleaned_name = payload.name.strip()
        if not cleaned_name:
            raise AppError("An event name is required", code="VALIDATION_ERROR", status=422)
        update_payload["name"] = cleaned_name
    if payload.description is not None:
        update_payload["description"] = payload.description.strip() or None
    if payload.date is not None:
        update_payload["date"] = payload.date.isoformat()
    if payload.location is not None:
        update_payload["location"] = _clean_location(payload.location)
    if payload.tags is not None:
        update_payload["tags"] = _normalize_tags(payload.tags)
    if payload.allow_anyone_upload is not None:
        update_payload["allow_anyone_upload"] = payload.allow_anyone_upload
    if payload.private_gallery is not None:
        update_payload["private_gallery"] = payload.private_gallery

    if update_payload:
        try:
            get_supabase_admin_client().table("events").update(update_payload).eq("id", event_id).execute()
        except Exception as exc:
            raise AppError("PictureMe could not update this event", code="EVENT_UPDATE_FAILED", status=500) from exc

    return get_event_detail(current_user, event_id=event_id)


def delete_event(current_user: AuthenticatedUser, *, event_id: str) -> None:
    """Delete an event and its dependent metadata. Only the creator may do this."""
    event = _get_event_or_404(event_id)
    _require_creator(current_user.user_id, event)
    client = get_supabase_admin_client()

    try:
        client.table("gallery_tokens").delete().eq("event_id", event_id).execute()
    except Exception:
        logger.info("Skipping gallery token cleanup for event %s because the table may not be present yet", event_id)

    try:
        client.table("user_photo_matches").delete().eq("event_id", event_id).execute()
        client.table("face_index").delete().eq("event_id", event_id).execute()
        client.table("photos").delete().eq("event_id", event_id).execute()
        client.table("event_members").delete().eq("event_id", event_id).execute()
        client.table("events").delete().eq("id", event_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not delete this event", code="EVENT_DELETE_FAILED", status=500) from exc

    _delete_rekognition_collection(event.rekognition_collection_id, suppress_not_found=True)


def list_event_members(current_user: AuthenticatedUser, *, event_id: str) -> list[EventMemberResponse]:
    """Return the event member list for creators and members."""
    event = _get_event_or_404(event_id)
    _require_event_role(current_user.user_id, event)
    rows = _fetch_event_member_rows(event_id)

    members: list[EventMemberResponse] = []
    for row in rows:
        member_user = _get_public_user_by_id(row.user_id)
        members.append(
            EventMemberResponse(
                id=row.id,
                userId=row.user_id,
                name=member_user.name,
                email=member_user.email,
                role=row.role,
                joinedAt=row.joined_at,
                avatarUrl=member_user.avatar_url,
            )
        )

    return members


def list_event_people(current_user: AuthenticatedUser, *, event_id: str) -> EventPeopleResponse:
    """Return signed-in members plus anonymous uploaders for one event."""
    event = _get_event_or_404(event_id)
    role = _require_event_role(current_user.user_id, event)
    creator = _get_public_user_by_id(event.creator_id)
    event_detail = _build_event_detail(event, current_user.user_id, role, creator)
    members = list_event_members(current_user, event_id=event_id)
    access_by_user_id = _get_gallery_access_statuses(event_id)
    upload_counts = _get_upload_counts_by_user(event_id)

    people: list[EventPersonResponse] = [
        EventPersonResponse(
            id=member.user_id,
            name=member.name,
            email=member.email,
            role=member.role,
            joinedAt=member.joined_at,
            avatarUrl=member.avatar_url,
            kind="member",
            uploadCount=upload_counts.get(member.user_id, 0),
            galleryAccessStatus=_get_effective_gallery_access_status(member.user_id, event, access_by_user_id),
        )
        for member in members
    ]
    people.extend(_list_anonymous_uploaders(event_id))
    return EventPeopleResponse(event=event_detail, people=people)


def update_event_member_role(
    current_user: AuthenticatedUser,
    *,
    event_id: str,
    member_user_id: str,
    role: EventRole,
) -> dict[str, bool]:
    """Update an event member role. Only the creator may promote or demote admins."""
    event = _get_event_or_404(event_id)
    _require_creator(current_user.user_id, event)

    if member_user_id == event.creator_id:
        raise AppError("The event creator role cannot be changed", code="ROLE_CHANGE_FORBIDDEN", status=403)

    membership = _get_membership(event_id, member_user_id)
    if membership is None:
        raise AppError("Event member not found", code="MEMBER_NOT_FOUND", status=404)

    try:
        get_supabase_admin_client().table("event_members").update({"role": role}).eq("event_id", event_id).eq(
            "user_id", member_user_id
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not update this role", code="MEMBER_ROLE_UPDATE_FAILED", status=500) from exc

    return {"success": True}


def request_gallery_access(current_user: AuthenticatedUser, *, event_id: str) -> GalleryAccessRequestResponse:
    """Create or reuse a pending gallery access request for the current user."""
    event = _get_event_or_404(event_id)
    if not event.private_gallery:
        return GalleryAccessRequestResponse(status="approved")
    if current_user.user_id == event.creator_id:
        return GalleryAccessRequestResponse(status="owner")

    membership = _get_membership(event.id, current_user.user_id)
    if membership and membership.role == "admin":
        return GalleryAccessRequestResponse(status="approved")

    existing_status = _get_gallery_access_status(event.id, current_user.user_id)
    if existing_status:
        return GalleryAccessRequestResponse(status=existing_status)

    try:
        get_supabase_admin_client().table("event_gallery_access").insert(
            {
                "event_id": event.id,
                "user_id": current_user.user_id,
                "status": "pending",
            }
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not request gallery access", code="ACCESS_REQUEST_FAILED", status=500) from exc

    return GalleryAccessRequestResponse(status="pending")


def list_gallery_access(current_user: AuthenticatedUser, *, event_id: str) -> list[GalleryAccessResponse]:
    """Return pending and approved private-gallery access rows. Creator only."""
    event = _get_event_or_404(event_id)
    _require_creator(current_user.user_id, event)
    rows = _fetch_gallery_access_rows(event_id)
    users = {user.id: user for user in _get_public_users_by_ids([row["user_id"] for row in rows if row.get("user_id")])}
    response: list[GalleryAccessResponse] = []
    for row in rows:
        user = users.get(str(row.get("user_id")))
        if user is None:
            continue
        response.append(
            GalleryAccessResponse(
                id=str(row["id"]),
                user=GalleryAccessUserResponse(id=user.id, name=user.name, email=user.email, avatarUrl=user.avatar_url),
                status=row.get("status", "pending"),
                requestedAt=row.get("requested_at"),
                approvedAt=row.get("approved_at"),
            )
        )
    return response


def invite_gallery_access_by_email(
    current_user: AuthenticatedUser,
    *,
    event_id: str,
    email: str,
) -> GalleryAccessResponse:
    """Approve gallery access for an existing PictureMe user by email."""
    event = _get_event_or_404(event_id)
    _require_creator(current_user.user_id, event)
    invited_user = _get_public_user_by_email(email.strip().lower())
    if invited_user.id == event.creator_id:
        raise AppError("The event creator already has gallery access", code="ACCESS_INVITE_INVALID", status=422)

    row = _upsert_gallery_access(
        event_id=event.id,
        user_id=invited_user.id,
        status="approved",
        invited_by=current_user.user_id,
    )
    return GalleryAccessResponse(
        id=str(row["id"]),
        user=GalleryAccessUserResponse(
            id=invited_user.id,
            name=invited_user.name,
            email=invited_user.email,
            avatarUrl=invited_user.avatar_url,
        ),
        status=row.get("status", "approved"),
        requestedAt=row.get("requested_at"),
        approvedAt=row.get("approved_at"),
    )


def update_gallery_access_status(
    current_user: AuthenticatedUser,
    *,
    event_id: str,
    user_id: str,
    status: str,
) -> GalleryAccessResponse:
    """Approve or move a private-gallery access row back to pending."""
    event = _get_event_or_404(event_id)
    _require_creator(current_user.user_id, event)
    if user_id == event.creator_id:
        raise AppError("The event creator access cannot be changed", code="ACCESS_CHANGE_FORBIDDEN", status=403)
    target_user = _get_public_user_by_id(user_id)
    row = _upsert_gallery_access(event_id=event.id, user_id=user_id, status=status, invited_by=current_user.user_id)
    return GalleryAccessResponse(
        id=str(row["id"]),
        user=GalleryAccessUserResponse(
            id=target_user.id,
            name=target_user.name,
            email=target_user.email,
            avatarUrl=target_user.avatar_url,
        ),
        status=row.get("status", status),
        requestedAt=row.get("requested_at"),
        approvedAt=row.get("approved_at"),
    )


def remove_gallery_access(current_user: AuthenticatedUser, *, event_id: str, user_id: str) -> dict[str, bool]:
    """Remove one user's private-gallery access row. Creator only."""
    event = _get_event_or_404(event_id)
    _require_creator(current_user.user_id, event)
    if user_id == event.creator_id:
        raise AppError("The event creator access cannot be removed", code="ACCESS_CHANGE_FORBIDDEN", status=403)
    try:
        get_supabase_admin_client().table("event_gallery_access").delete().eq("event_id", event.id).eq(
            "user_id", user_id
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not remove gallery access", code="ACCESS_REMOVE_FAILED", status=500) from exc
    return {"success": True}


def get_join_preview(token: str, current_user: AuthenticatedUser | None = None) -> JoinPreviewResponse:
    """Return a public-safe preview for an invite token."""
    event = _get_event_by_join_token(token)
    creator = _get_public_user_by_id(event.creator_id)
    photo_count = _count_rows("photos", {"event_id": event.id})
    member_count = _count_rows("event_members", {"event_id": event.id})
    already_joined = None
    if current_user is not None:
        already_joined = _membership_exists(event.id, current_user.user_id) or current_user.user_id == event.creator_id

    return JoinPreviewResponse(
        id=event.id,
        name=event.name,
        date=event.date,
        location=event.location,
        tags=event.tags,
        allowAnyoneUpload=event.allow_anyone_upload,
        privateGallery=event.private_gallery,
        galleryAccessStatus=_get_public_gallery_access_status(event, current_user.user_id) if current_user else None,
        hostName=creator.name,
        coverUrl=event.cover_url,
        photoCount=photo_count,
        memberCount=member_count,
        status=event.status,
        joinToken=event.join_token,
        alreadyJoined=already_joined,
    )


def get_public_event_gallery(token: str, current_user: AuthenticatedUser | None = None) -> PublicEventGalleryResponse:
    """Return the public event gallery for an invite token."""
    preview = get_join_preview(token, current_user=current_user)
    event = _get_event_by_join_token(token)
    if event.private_gallery and (
        current_user is None or not _can_view_private_gallery(current_user.user_id, event)
    ):
        photo_records = []
    else:
        photo_records = _list_public_event_photos(event.id)
    return PublicEventGalleryResponse(
        event=preview,
        photos=[_map_public_photo(photo) for photo in photo_records],
    )


def join_event(
    current_user: AuthenticatedUser,
    *,
    event_id: str,
    background_tasks: BackgroundTasks,
) -> EventJoinResponse:
    """Join an event if needed and enqueue the async match kickoff when eligible."""
    event = _get_event_or_404(event_id)
    public_user = get_public_user_record(current_user)
    if event.creator_id == current_user.user_id:
        return EventJoinResponse(eventId=event.id, alreadyJoined=True, role="creator")

    membership = _get_membership(event.id, current_user.user_id)
    already_joined = membership is not None

    if not already_joined:
        try:
            get_supabase_admin_client().table("event_members").insert(
                {
                    "event_id": event.id,
                    "user_id": current_user.user_id,
                    "role": "member",
                }
            ).execute()
        except Exception as exc:
            raise AppError("PictureMe could not join this event", code="EVENT_JOIN_FAILED", status=500) from exc

    if public_user.has_face_profile:
        background_tasks.add_task(
            trigger_user_event_match,
            user_id=current_user.user_id,
            event_id=event.id,
            reason="event-join",
        )

    return EventJoinResponse(eventId=event.id, alreadyJoined=already_joined, role=membership.role if membership else "member")


def _build_event_summaries(user_id: str, events: list[EventRecord]) -> list[EventSummaryResponse]:
    event_ids = [event.id for event in events]
    photo_counts = _count_rows_by_event("photos", event_ids)
    member_counts = _count_rows_by_event("event_members", event_ids)
    member_previews = _get_member_previews_by_event(event_ids)
    match_counts = _count_rows_by_event("user_photo_matches", event_ids, {"user_id": user_id})
    roles = _get_event_roles(event_ids, user_id)
    creator_ids = {event.creator_id for event in events}
    creators = {user.id: user for user in (_get_public_users_by_ids(list(creator_ids)) if creator_ids else [])}

    summaries: list[EventSummaryResponse] = []
    for event in events:
        creator = creators.get(event.creator_id)
        role = "creator" if event.creator_id == user_id else roles.get(event.id, "member")
        summaries.append(
            EventSummaryResponse(
                id=event.id,
                name=event.name,
                description=event.description,
                date=event.date,
                location=event.location,
                tags=event.tags,
                allowAnyoneUpload=event.allow_anyone_upload,
                privateGallery=event.private_gallery,
                coverUrl=event.cover_url,
                hostName=creator.name if creator else "PictureMe Host",
                photoCount=photo_counts.get(event.id, 0),
                memberCount=member_counts.get(event.id, 0),
                memberPreviews=member_previews.get(event.id, []),
                myPhotosCount=match_counts.get(event.id, 0),
                status=event.status,
                role=role,
            )
        )

    return summaries


def _build_event_detail(
    event: EventRecord,
    user_id: str,
    role: EventRole,
    creator: PublicUserRecord,
) -> EventDetailResponse:
    return EventDetailResponse(
        id=event.id,
        name=event.name,
        description=event.description,
        date=event.date,
        location=event.location,
        tags=event.tags,
        allowAnyoneUpload=event.allow_anyone_upload,
        privateGallery=event.private_gallery,
        galleryAccessStatus=_get_public_gallery_access_status(event, user_id),
        status=event.status,
        coverUrl=event.cover_url,
        joinToken=event.join_token,
        role=role,
        creator=CreatorSummary(id=creator.id, name=creator.name),
        counts={
            "allPhotos": _count_rows("photos", {"event_id": event.id}),
            "myPhotos": _count_rows("user_photo_matches", {"event_id": event.id, "user_id": user_id}),
            "members": _count_rows("event_members", {"event_id": event.id}),
        },
    )


def _map_account_user(user: PublicUserRecord) -> AccountUserResponse:
    return AccountUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        avatarUrl=user.avatar_url,
        hasFaceProfile=user.has_face_profile,
        faceIndexedAt=user.face_indexed_at,
    )


def _list_public_event_photos(event_id: str) -> list[PhotoRecord]:
    client = get_supabase_admin_client()
    try:
        response = client.table("photos").select(
            "id,event_id,uploaded_by,uploader_name,cloudinary_url,thumbnail_url,original_filename,uploaded_at,face_count"
        ).eq("event_id", event_id).order("uploaded_at", desc=True).execute()
    except Exception as exc:
        if not _is_missing_original_filename_column(exc):
            raise AppError("PictureMe could not load this public gallery", code="GALLERY_FETCH_FAILED", status=500) from exc

        try:
            response = client.table("photos").select(
                "id,event_id,uploaded_by,uploader_name,cloudinary_url,thumbnail_url,uploaded_at,face_count"
            ).eq("event_id", event_id).order("uploaded_at", desc=True).execute()
        except Exception as retry_exc:
            raise AppError("PictureMe could not load this public gallery", code="GALLERY_FETCH_FAILED", status=500) from retry_exc

    return [
        _normalize_photo(row)
        for row in (response.data or [])
        if row.get("cloudinary_url")
    ]


def _normalize_photo(row: dict) -> PhotoRecord:
    face_count = row.get("face_count")
    if face_count is None:
        row = {**row, "face_count": 0}
    if "uploaded_by" not in row:
        row = {**row, "uploaded_by": None}
    if "uploader_name" not in row:
        row = {**row, "uploader_name": None}
    return PhotoRecord.model_validate(row)


def _map_public_photo(photo: PhotoRecord) -> PhotoResponse:
    return PhotoResponse(
        id=photo.id,
        cloudinaryUrl=photo.cloudinary_url,
        thumbnailUrl=photo.thumbnail_url,
        originalFilename=photo.original_filename,
        uploaderName=photo.uploader_name,
        uploaderIsAnonymous=photo.uploaded_by is None,
        uploadedAt=photo.uploaded_at,
        faceCount=photo.face_count,
    )


def _is_missing_original_filename_column(exc: Exception) -> bool:
    message = str(exc).casefold()
    return "original_filename" in message and (
        "column" in message or "schema cache" in message or "pgrst" in message
    )


def _get_event_or_404(event_id: str) -> EventRecord:
    try:
        response = get_supabase_admin_client().table("events").select(_EVENT_SELECT_COLUMNS).eq("id", event_id).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not load this event", code="EVENT_FETCH_FAILED", status=500) from exc

    if not response.data:
        raise AppError("Event not found", code="EVENT_NOT_FOUND", status=404)

    return EventRecord.model_validate(response.data)


def _get_event_by_join_token(token: str) -> EventRecord:
    try:
        response = get_supabase_admin_client().table("events").select(_EVENT_SELECT_COLUMNS).eq("join_token", token).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not load this event invite", code="EVENT_FETCH_FAILED", status=500) from exc

    if not response.data:
        raise AppError("This invite link is no longer available", code="INVITE_NOT_FOUND", status=404)

    return EventRecord.model_validate(response.data)


def _list_events_by_creator(user_id: str) -> list[EventRecord]:
    try:
        response = get_supabase_admin_client().table("events").select(_EVENT_SELECT_COLUMNS).eq("creator_id", user_id).order("date", desc=True).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load your dashboard", code="DASHBOARD_FETCH_FAILED", status=500) from exc

    return [EventRecord.model_validate(row) for row in (response.data or [])]


def _list_events_by_ids(event_ids: list[str]) -> list[EventRecord]:
    if not event_ids:
        return []

    try:
        response = get_supabase_admin_client().table("events").select(_EVENT_SELECT_COLUMNS).in_("id", event_ids).order("date", desc=True).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load your dashboard", code="DASHBOARD_FETCH_FAILED", status=500) from exc

    return [EventRecord.model_validate(row) for row in (response.data or [])]


def _list_memberships_by_user(user_id: str) -> list[EventMemberRecord]:
    try:
        response = get_supabase_admin_client().table("event_members").select(
            "id,event_id,user_id,role,joined_at"
        ).eq("user_id", user_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load your dashboard", code="DASHBOARD_FETCH_FAILED", status=500) from exc

    return [EventMemberRecord.model_validate(row) for row in (response.data or [])]


def _fetch_event_member_rows(event_id: str) -> list[EventMemberRecord]:
    try:
        response = get_supabase_admin_client().table("event_members").select(
            "id,event_id,user_id,role,joined_at"
        ).eq("event_id", event_id).order("joined_at").execute()
    except Exception as exc:
        raise AppError("PictureMe could not load event members", code="MEMBERS_FETCH_FAILED", status=500) from exc

    return [EventMemberRecord.model_validate(row) for row in (response.data or [])]


def _get_membership(event_id: str, user_id: str) -> EventMemberRecord | None:
    try:
        response = get_supabase_admin_client().table("event_members").select(
            "id,event_id,user_id,role,joined_at"
        ).eq("event_id", event_id).eq("user_id", user_id).limit(1).execute()
    except Exception as exc:
        raise AppError("PictureMe could not verify event access", code="EVENT_ACCESS_FAILED", status=500) from exc

    rows = response.data or []
    if not rows:
        return None
    return EventMemberRecord.model_validate(rows[0])


def _membership_exists(event_id: str, user_id: str) -> bool:
    return _get_membership(event_id, user_id) is not None


def _require_event_role(user_id: str, event: EventRecord) -> EventRole:
    if event.creator_id == user_id:
        return "creator"

    membership = _get_membership(event.id, user_id)
    if membership is None:
        raise AppError("You do not have access to this event", code="FORBIDDEN", status=403)
    return membership.role


def _require_creator(user_id: str, event: EventRecord) -> None:
    if event.creator_id != user_id:
        raise AppError("Only the event creator can perform this action", code="FORBIDDEN", status=403)


def _get_event_roles(event_ids: list[str], user_id: str) -> dict[str, EventRole]:
    if not event_ids:
        return {}

    try:
        response = get_supabase_admin_client().table("event_members").select("event_id,role").eq("user_id", user_id).in_(
            "event_id", event_ids
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load your event roles", code="DASHBOARD_FETCH_FAILED", status=500) from exc

    rows = response.data or []
    return {
        row["event_id"]: row["role"]
        for row in rows
        if row.get("event_id") and row.get("role") in {"creator", "admin", "member"}
    }


def _get_member_previews_by_event(event_ids: list[str]) -> dict[str, list[EventMemberPreviewResponse]]:
    if not event_ids:
        return {}

    try:
        response = get_supabase_admin_client().table("event_members").select("event_id,user_id,joined_at").in_(
            "event_id", event_ids
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load event members", code="MEMBERS_FETCH_FAILED", status=500) from exc

    rows = [
        row
        for row in (response.data or [])
        if row.get("event_id") and row.get("user_id")
    ]
    rows.sort(key=lambda row: (str(row["event_id"]), str(row.get("joined_at") or "")))

    user_ids = list({str(row["user_id"]) for row in rows})
    users_by_id = {user.id: user for user in _get_public_users_by_ids(user_ids)}

    previews_by_event: dict[str, list[EventMemberPreviewResponse]] = {}
    for row in rows:
        event_id = str(row["event_id"])
        user_id = str(row["user_id"])
        user = users_by_id.get(user_id)
        if user is None:
            continue

        event_previews = previews_by_event.setdefault(event_id, [])
        if len(event_previews) >= 3 or any(preview.id == user.id for preview in event_previews):
            continue

        event_previews.append(
            EventMemberPreviewResponse(
                id=user.id,
                name=user.name,
                avatarUrl=user.avatar_url,
            )
        )

    return previews_by_event


def _count_rows(table: str, filters: dict[str, str]) -> int:
    try:
        query = get_supabase_admin_client().table(table).select("*", count="exact", head=True)
        for key, value in filters.items():
            query = query.eq(key, value)
        response = query.execute()
    except Exception as exc:
        raise AppError("PictureMe could not load event counts", code="COUNT_FETCH_FAILED", status=500) from exc

    return response.count or 0


def _count_rows_by_event(table: str, event_ids: list[str], filters: dict[str, str] | None = None) -> dict[str, int]:
    if not event_ids:
        return {}

    try:
        query = get_supabase_admin_client().table(table).select("event_id").in_("event_id", event_ids)
        for key, value in (filters or {}).items():
            query = query.eq(key, value)
        response = query.execute()
    except Exception as exc:
        raise AppError("PictureMe could not load event counts", code="COUNT_FETCH_FAILED", status=500) from exc

    counts: dict[str, int] = {}
    for row in response.data or []:
        event_id = row.get("event_id")
        if not event_id:
            continue
        counts[event_id] = counts.get(event_id, 0) + 1
    return counts


def _get_public_user_by_id(user_id: str) -> PublicUserRecord:
    users = _get_public_users_by_ids([user_id])
    if not users:
        raise AppError("PictureMe could not resolve the event owner", code="USER_NOT_FOUND", status=404)
    return users[0]


def _get_public_user_by_email(email: str) -> PublicUserRecord:
    try:
        response = get_supabase_admin_client().table("users").select(
            "id,email,name,avatar_url,face_indexed_at,rekognition_face_id"
        ).eq("email", email).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not look up that user", code="USER_FETCH_FAILED", status=500) from exc

    if not response.data:
        raise AppError("No signed-up PictureMe user was found for that email", code="USER_NOT_FOUND", status=404)
    return PublicUserRecord.model_validate(response.data)


def _get_public_gallery_access_status(event: EventRecord, user_id: str) -> GalleryAccessStatus:
    if user_id == event.creator_id:
        return "owner"
    membership = _get_membership(event.id, user_id)
    if membership and membership.role == "admin":
        return "approved"
    return _get_gallery_access_status(event.id, user_id) or "none"


def _get_effective_gallery_access_status(
    user_id: str,
    event: EventRecord,
    access_by_user_id: dict[str, GalleryAccessStatus],
) -> GalleryAccessStatus:
    if user_id == event.creator_id:
        return "owner"
    membership = _get_membership(event.id, user_id)
    if membership and membership.role == "admin":
        return "approved"
    return access_by_user_id.get(user_id, "none")


def _can_view_private_gallery(user_id: str, event: EventRecord) -> bool:
    return _get_public_gallery_access_status(event, user_id) in {"owner", "approved"}


def _get_gallery_access_status(event_id: str, user_id: str) -> GalleryAccessStatus | None:
    try:
        response = get_supabase_admin_client().table("event_gallery_access").select("status").eq(
            "event_id", event_id
        ).eq("user_id", user_id).maybe_single().execute()
    except Exception as exc:
        if _is_missing_gallery_access_table(exc):
            return None
        raise AppError("PictureMe could not verify gallery access", code="ACCESS_FETCH_FAILED", status=500) from exc

    status = response.data.get("status") if response.data else None
    return status if status in {"pending", "approved"} else None


def _get_gallery_access_statuses(event_id: str) -> dict[str, GalleryAccessStatus]:
    rows = _fetch_gallery_access_rows(event_id)
    return {
        str(row["user_id"]): row["status"]
        for row in rows
        if row.get("user_id") and row.get("status") in {"pending", "approved"}
    }


def _fetch_gallery_access_rows(event_id: str) -> list[dict]:
    try:
        response = get_supabase_admin_client().table("event_gallery_access").select(
            "id,event_id,user_id,status,requested_at,approved_at"
        ).eq("event_id", event_id).order("requested_at").execute()
    except Exception as exc:
        if _is_missing_gallery_access_table(exc):
            return []
        raise AppError("PictureMe could not load gallery access", code="ACCESS_FETCH_FAILED", status=500) from exc
    return response.data or []


def _upsert_gallery_access(*, event_id: str, user_id: str, status: str, invited_by: str) -> dict:
    now = datetime.now(timezone.utc)
    payload = {
        "event_id": event_id,
        "user_id": user_id,
        "status": status,
        "invited_by": invited_by,
        "approved_at": now.isoformat() if status == "approved" else None,
    }
    try:
        response = get_supabase_admin_client().table("event_gallery_access").upsert(
            payload,
            on_conflict="event_id,user_id",
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not save gallery access", code="ACCESS_SAVE_FAILED", status=500) from exc
    row = get_first_row(response.data)
    if row:
        return row
    return {
        "id": f"{event_id}:{user_id}",
        "event_id": event_id,
        "user_id": user_id,
        "status": status,
        "requested_at": now,
        "approved_at": now if status == "approved" else None,
    }


def _get_upload_counts_by_user(event_id: str) -> dict[str, int]:
    try:
        response = get_supabase_admin_client().table("photos").select("uploaded_by").eq("event_id", event_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load uploader counts", code="PHOTO_FETCH_FAILED", status=500) from exc
    counts: dict[str, int] = {}
    for row in response.data or []:
        uploaded_by = row.get("uploaded_by")
        if uploaded_by:
            counts[str(uploaded_by)] = counts.get(str(uploaded_by), 0) + 1
    return counts


def _list_anonymous_uploaders(event_id: str) -> list[EventPersonResponse]:
    try:
        response = get_supabase_admin_client().table("upload_jobs").select(
            "id,uploader_name,total_files"
        ).eq("event_id", event_id).is_("created_by", None).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load anonymous uploaders", code="UPLOADERS_FETCH_FAILED", status=500) from exc

    counts: dict[str, int] = {}
    for row in response.data or []:
        name = str(row.get("uploader_name") or "Anonymous uploader").strip() or "Anonymous uploader"
        counts[name] = counts.get(name, 0) + int(row.get("total_files") or 0)

    return [
        EventPersonResponse(
            id=f"anonymous-{index}",
            name=name,
            kind="anonymous",
            uploadCount=count,
        )
        for index, (name, count) in enumerate(sorted(counts.items()), start=1)
    ]


def _is_missing_gallery_access_table(exc: Exception) -> bool:
    message = str(exc).casefold()
    return "event_gallery_access" in message and (
        "does not exist" in message or "schema cache" in message or "pgrst" in message
    )


def _get_public_users_by_ids(user_ids: list[str]) -> list[PublicUserRecord]:
    if not user_ids:
        return []

    try:
        response = get_supabase_admin_client().table("users").select(
            "id,email,name,avatar_url,face_indexed_at,rekognition_face_id"
        ).in_("id", user_ids).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load user records", code="USER_FETCH_FAILED", status=500) from exc

    return [PublicUserRecord.model_validate(row) for row in (response.data or [])]


def _normalize_tags(tags: list[str] | None) -> list[str]:
    normalized_tags: list[str] = []
    for tag in tags or []:
        cleaned_tag = tag.strip()
        if cleaned_tag and cleaned_tag not in normalized_tags:
            normalized_tags.append(cleaned_tag[:30])
    return normalized_tags


def _clean_location(location: str | None) -> str:
    cleaned_location = (location or "").strip()
    return cleaned_location[:200] if cleaned_location else "TBD"


def _generate_join_token() -> str:
    return secrets.token_urlsafe(9).replace("-", "").replace("_", "").lower()[:12]


def _delete_rekognition_collection(collection_id: str, *, suppress_not_found: bool = False) -> None:
    try:
        get_rekognition_client().delete_collection(CollectionId=collection_id)
    except Exception as exc:
        if suppress_not_found:
            logger.warning("Failed to delete Rekognition collection %s", collection_id)
            return
        raise AppError("PictureMe could not delete the event collection", code="REKOGNITION_DELETE_FAILED", status=502) from exc
