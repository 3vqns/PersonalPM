"""Backend-owned gallery reads and tokenized public sharing."""

from __future__ import annotations

import secrets
from typing import Iterable

from backend.config import getSettings
from backend.core.supabase_admin import get_supabase_admin_client
from backend.dependencies.auth import AuthenticatedUser
from backend.errors import AppError
from backend.schemas.event import (
    AllPhotosResponse,
    EventRecord,
    GalleryResponse,
    GalleryTokenRecord,
    MatchedPhotoResponse,
    MyPhotosResponse,
    PhotoRecord,
    PhotoResponse,
    ShareGalleryTokenResponse,
    SharedGalleryEventResponse,
    SharedGalleryOwnerResponse,
    UserPhotoMatchRecord,
)
from backend.services.account_service import get_public_user_record


def get_event_photos(current_user: AuthenticatedUser, *, event_id: str) -> AllPhotosResponse:
    """Return the full gallery for an authorized event member."""
    event = _get_event_or_404(event_id)
    _require_event_membership(current_user.user_id, event)
    photo_records = _list_event_photos(event.id)
    return AllPhotosResponse(photos=[_map_photo(photo) for photo in photo_records])


def get_my_photos(current_user: AuthenticatedUser, *, event_id: str) -> MyPhotosResponse:
    """Return only the current user's matched photos for an event."""
    event = _get_event_or_404(event_id)
    _require_event_membership(current_user.user_id, event)
    public_user = get_public_user_record(current_user)
    matched_photos = _list_user_matched_photos(user_id=current_user.user_id, event_id=event.id)
    download_url = matched_photos[0].cloudinary_url if matched_photos else None

    return MyPhotosResponse(
        photos=[_map_matched_photo(match, photo) for match, photo in matched_photos],
        downloadAllUrl=download_url,
        hasFaceProfile=public_user.has_face_profile,
    )


def create_or_reuse_gallery_token(current_user: AuthenticatedUser, *, event_id: str) -> ShareGalleryTokenResponse:
    """Create or reuse one share token per user/event pair."""
    event = _get_event_or_404(event_id)
    _require_event_membership(current_user.user_id, event)
    if event.status != "active":
        raise AppError("Expired events cannot create new shared galleries", code="EVENT_EXPIRED", status=409)

    client = get_supabase_admin_client()
    try:
        existing = client.table("gallery_tokens").select("token,user_id,event_id,created_at").eq("user_id", current_user.user_id).eq(
            "event_id", event_id
        ).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not load your gallery share token", code="GALLERY_TOKEN_FETCH_FAILED", status=500) from exc

    token = existing.data["token"] if existing.data else _create_gallery_token(event_id=event_id, user_id=current_user.user_id)
    settings = getSettings()
    return ShareGalleryTokenResponse(token=token, url=f"{settings.frontend_origin.rstrip('/')}/gallery/{token}")


def get_shared_gallery(token: str) -> GalleryResponse:
    """Return the token owner's matched-photo gallery only."""
    token_record = _get_gallery_token_or_404(token)
    event = _get_event_or_404(token_record.event_id)
    owner = _get_public_user_by_id(token_record.user_id)
    matched_photos = [] if event.status != "active" else _list_user_matched_photos(user_id=token_record.user_id, event_id=event.id)
    download_url = matched_photos[0][1].cloudinary_url if matched_photos else None

    return GalleryResponse(
        event=SharedGalleryEventResponse(id=event.id, name=event.name, date=event.date),
        sharedBy=SharedGalleryOwnerResponse(id=owner.id, name=owner.name, avatarUrl=owner.avatar_url),
        photos=[_map_matched_photo(match, photo) for match, photo in matched_photos],
        downloadAllUrl=download_url,
    )


def _create_gallery_token(*, event_id: str, user_id: str) -> str:
    client = get_supabase_admin_client()
    last_error: Exception | None = None

    for _ in range(3):
        token = secrets.token_urlsafe(18).replace("-", "").replace("_", "")[:24]
        try:
            client.table("gallery_tokens").insert({"token": token, "user_id": user_id, "event_id": event_id}).execute()
            return token
        except Exception as exc:
            last_error = exc

    raise AppError("PictureMe could not create your gallery share token", code="GALLERY_TOKEN_CREATE_FAILED", status=500) from last_error


def _get_gallery_token_or_404(token: str) -> GalleryTokenRecord:
    try:
        response = get_supabase_admin_client().table("gallery_tokens").select("token,user_id,event_id,created_at").eq(
            "token", token
        ).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not load this shared gallery", code="GALLERY_FETCH_FAILED", status=500) from exc

    if not response.data:
        raise AppError("This shared gallery link is no longer available", code="GALLERY_NOT_FOUND", status=404)

    return GalleryTokenRecord.model_validate(response.data)


def _get_event_or_404(event_id: str) -> EventRecord:
    try:
        response = get_supabase_admin_client().table("events").select(
            "id,creator_id,name,description,date,expires_at,join_token,rekognition_collection_id,cover_url,status,created_at"
        ).eq("id", event_id).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not load this event", code="EVENT_FETCH_FAILED", status=500) from exc

    if not response.data:
        raise AppError("Event not found", code="EVENT_NOT_FOUND", status=404)

    return EventRecord.model_validate(response.data)


def _require_event_membership(user_id: str, event: EventRecord) -> None:
    if event.creator_id == user_id:
        return

    try:
        response = get_supabase_admin_client().table("event_members").select("id").eq("event_id", event.id).eq(
            "user_id", user_id
        ).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not verify event access", code="EVENT_ACCESS_FAILED", status=500) from exc

    if not response.data:
        raise AppError("You do not have access to this event", code="FORBIDDEN", status=403)


def _list_event_photos(event_id: str) -> list[PhotoRecord]:
    try:
        response = get_supabase_admin_client().table("photos").select(
            "id,event_id,cloudinary_url,thumbnail_url,uploaded_at,face_count"
        ).eq("event_id", event_id).order("uploaded_at", desc=True).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load this gallery", code="GALLERY_FETCH_FAILED", status=500) from exc

    return [_normalize_photo(row) for row in (response.data or []) if row.get("cloudinary_url")]


def _list_user_matched_photos(*, user_id: str, event_id: str) -> list[tuple[UserPhotoMatchRecord, PhotoRecord]]:
    try:
        matches_response = get_supabase_admin_client().table("user_photo_matches").select(
            "id,user_id,photo_id,event_id,similarity_score,matched_at"
        ).eq("event_id", event_id).eq("user_id", user_id).order("matched_at", desc=True).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load your matched photos", code="MATCHED_GALLERY_FETCH_FAILED", status=500) from exc

    matches = [UserPhotoMatchRecord.model_validate(row) for row in (matches_response.data or [])]
    photo_ids = [match.photo_id for match in matches]
    photo_map = _get_photos_by_ids(photo_ids)
    return [(match, photo_map[match.photo_id]) for match in matches if match.photo_id in photo_map]


def _get_photos_by_ids(photo_ids: Iterable[str]) -> dict[str, PhotoRecord]:
    photo_id_list = list(dict.fromkeys(photo_ids))
    if not photo_id_list:
        return {}

    try:
        response = get_supabase_admin_client().table("photos").select(
            "id,event_id,cloudinary_url,thumbnail_url,uploaded_at,face_count"
        ).in_("id", photo_id_list).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load gallery photo records", code="PHOTO_FETCH_FAILED", status=500) from exc

    return {
        photo.id: photo
        for photo in (_normalize_photo(row) for row in (response.data or []))
        if photo.cloudinary_url
    }


def _get_public_user_by_id(user_id: str):
    try:
        response = get_supabase_admin_client().table("users").select(
            "id,email,name,avatar_url,face_indexed_at,rekognition_face_id"
        ).eq("id", user_id).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not load the shared gallery owner", code="USER_FETCH_FAILED", status=500) from exc

    if not response.data:
        raise AppError("This shared gallery owner could not be resolved", code="USER_NOT_FOUND", status=404)

    from backend.schemas.account import PublicUserRecord

    return PublicUserRecord.model_validate(response.data)


def _normalize_photo(row: dict) -> PhotoRecord:
    face_count = row.get("face_count")
    if face_count is None:
        row = {**row, "face_count": 0}
    return PhotoRecord.model_validate(row)


def _map_photo(photo: PhotoRecord) -> PhotoResponse:
    return PhotoResponse(
        id=photo.id,
        cloudinaryUrl=photo.cloudinary_url,
        thumbnailUrl=photo.thumbnail_url,
        uploadedAt=photo.uploaded_at,
        faceCount=photo.face_count,
    )


def _map_matched_photo(match: UserPhotoMatchRecord, photo: PhotoRecord) -> MatchedPhotoResponse:
    return MatchedPhotoResponse(
        id=photo.id,
        cloudinaryUrl=photo.cloudinary_url,
        thumbnailUrl=photo.thumbnail_url,
        uploadedAt=photo.uploaded_at,
        faceCount=photo.face_count,
        matchedAt=match.matched_at,
        similarityScore=match.similarity_score,
    )
