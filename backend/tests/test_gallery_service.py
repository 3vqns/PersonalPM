"""Gallery-sharing hardening tests."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from backend.dependencies.auth import AuthenticatedUser
from backend.errors import AppError
from backend.schemas.account import PublicUserRecord
from backend.schemas.event import EventRecord, GalleryTokenRecord, PhotoRecord, UserPhotoMatchRecord
from backend.services import gallery_service


def test_shared_gallery_uses_only_token_owner_matches(monkeypatch) -> None:
    event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Expo",
        description=None,
        date=date(2026, 4, 18),
        expires_at=datetime(2026, 4, 25, tzinfo=timezone.utc),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )

    monkeypatch.setattr(
        gallery_service,
        "_get_gallery_token_or_404",
        lambda _token: GalleryTokenRecord(token="public-token", user_id="user-1", event_id=event.id),
    )
    monkeypatch.setattr(gallery_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(
        gallery_service,
        "_get_public_user_by_id",
        lambda _user_id: PublicUserRecord(
            id="user-1",
            email="user@example.com",
            name="User One",
            avatar_url="https://example.com/avatar.jpg",
            face_indexed_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
            rekognition_face_id=None,
        ),
    )
    monkeypatch.setattr(
        gallery_service,
        "_list_user_matched_photos",
        lambda user_id, event_id: [
            (
                UserPhotoMatchRecord(
                    id="match-1",
                    user_id=user_id,
                    photo_id="photo-1",
                    event_id=event_id,
                    similarity_score=96.5,
                    matched_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
                ),
                PhotoRecord(
                    id="photo-1",
                    event_id=event_id,
                    cloudinary_url="https://example.com/photo.jpg",
                    thumbnail_url="https://example.com/photo-thumb.jpg",
                    uploaded_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
                    face_count=3,
                ),
            )
        ],
    )

    response = gallery_service.get_shared_gallery("public-token")

    assert response.shared_by.id == "user-1"
    assert [photo.id for photo in response.photos] == ["photo-1"]
    assert response.download_all_url == "https://example.com/photo.jpg"


def test_my_photos_uses_first_matched_photo_for_download_url(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="user-1",
        email="user@example.com",
        access_token="token",
        raw_user={"id": "user-1", "email": "user@example.com"},
    )
    event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Expo",
        description=None,
        date=date(2026, 4, 18),
        expires_at=datetime(2026, 4, 25, tzinfo=timezone.utc),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )

    monkeypatch.setattr(gallery_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(gallery_service, "_require_event_membership", lambda _user_id, _event: None)
    monkeypatch.setattr(
        gallery_service,
        "get_public_user_record",
        lambda _current_user: PublicUserRecord(
            id="user-1",
            email="user@example.com",
            name="User One",
            avatar_url="https://example.com/avatar.jpg",
            face_indexed_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
            rekognition_face_id=None,
        ),
    )
    monkeypatch.setattr(
        gallery_service,
        "_list_user_matched_photos",
        lambda user_id, event_id: [
            (
                UserPhotoMatchRecord(
                    id="match-1",
                    user_id=user_id,
                    photo_id="photo-1",
                    event_id=event_id,
                    similarity_score=96.5,
                    matched_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
                ),
                PhotoRecord(
                    id="photo-1",
                    event_id=event_id,
                    cloudinary_url="https://example.com/photo.jpg",
                    thumbnail_url="https://example.com/photo-thumb.jpg",
                    uploaded_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
                    face_count=3,
                ),
            )
        ],
    )

    response = gallery_service.get_my_photos(current_user, event_id=event.id)

    assert [photo.id for photo in response.photos] == ["photo-1"]
    assert response.download_all_url == "https://example.com/photo.jpg"
    assert response.has_face_profile is True


def test_gallery_token_creation_rejects_expired_events(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="user-1",
        email="user@example.com",
        access_token="token",
        raw_user={"id": "user-1", "email": "user@example.com"},
    )
    expired_event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Expo",
        description=None,
        date=date(2026, 4, 18),
        expires_at=datetime(2026, 4, 19, tzinfo=timezone.utc),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="expired",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )

    monkeypatch.setattr(gallery_service, "_get_event_or_404", lambda _event_id: expired_event)
    monkeypatch.setattr(gallery_service, "_require_event_membership", lambda _user_id, _event: None)

    with pytest.raises(AppError) as exc_info:
        gallery_service.create_or_reuse_gallery_token(current_user, event_id=expired_event.id)

    assert exc_info.value.code == "EVENT_EXPIRED"
