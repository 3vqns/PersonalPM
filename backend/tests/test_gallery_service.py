"""Gallery-sharing hardening tests."""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace

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


def test_shared_gallery_rejects_private_gallery_tokens(monkeypatch) -> None:
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
        private_gallery=True,
    )

    monkeypatch.setattr(
        gallery_service,
        "_get_gallery_token_or_404",
        lambda _token: GalleryTokenRecord(token="public-token", user_id="user-1", event_id=event.id),
    )
    monkeypatch.setattr(gallery_service, "_get_event_or_404", lambda _event_id: event)

    with pytest.raises(AppError) as exc_info:
        gallery_service.get_shared_gallery("public-token")

    assert exc_info.value.code == "GALLERY_ACCESS_REQUIRED"
    assert exc_info.value.status == 403


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
    monkeypatch.setattr(gallery_service, "_require_gallery_access", lambda _user_id, _event: None)
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


def test_gallery_token_creation_allows_existing_expired_status_after_expiry_removal(monkeypatch) -> None:
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
    monkeypatch.setattr(gallery_service, "_require_gallery_access", lambda _user_id, _event: None)
    monkeypatch.setattr(gallery_service, "_create_gallery_token", lambda **_kwargs: "token-1")
    monkeypatch.setattr(
        gallery_service,
        "getSettings",
        lambda: SimpleNamespace(frontend_origin="http://localhost:5173"),
    )

    response = gallery_service.create_or_reuse_gallery_token(current_user, event_id=expired_event.id)

    assert response.token == "token-1"


def test_gallery_token_is_deterministic_and_decodes_without_db(monkeypatch) -> None:
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

    response_a = gallery_service.create_or_reuse_gallery_token(current_user, event_id=event.id)
    response_b = gallery_service.create_or_reuse_gallery_token(current_user, event_id=event.id)
    decoded = gallery_service._get_gallery_token_or_404(response_a.token)

    assert response_a.token == response_b.token
    assert decoded.event_id == event.id
    assert decoded.user_id == current_user.user_id


def test_event_gallery_token_is_deterministic_and_decodes_without_db(monkeypatch) -> None:
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
    monkeypatch.setattr(gallery_service, "_require_gallery_access", lambda _user_id, _event: None)
    monkeypatch.setattr(
        gallery_service,
        "getSettings",
        lambda: SimpleNamespace(frontend_origin="http://localhost:5173", internal_api_secret_value="secret"),
    )

    response_a = gallery_service.create_or_reuse_event_gallery_token(current_user, event_id=event.id)
    response_b = gallery_service.create_or_reuse_event_gallery_token(current_user, event_id=event.id)
    decoded_event_id = gallery_service._get_event_gallery_token_event_id_or_404(response_a.token)

    assert response_a.token == response_b.token
    assert response_a.url == f"http://localhost:5173/event-gallery/{response_a.token}"
    assert decoded_event_id == event.id


def test_shared_event_gallery_returns_full_event_photos(monkeypatch) -> None:
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
        "getSettings",
        lambda: SimpleNamespace(frontend_origin="http://localhost:5173", internal_api_secret_value="secret"),
    )
    token = gallery_service._create_event_gallery_token(event_id=event.id)
    monkeypatch.setattr(gallery_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(
        gallery_service,
        "_get_public_user_by_id",
        lambda _user_id: PublicUserRecord(
            id="creator-1",
            email="creator@example.com",
            name="Creator One",
            avatar_url="https://example.com/avatar.jpg",
            face_indexed_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
            rekognition_face_id=None,
        ),
    )
    monkeypatch.setattr(
        gallery_service,
        "_list_event_photos",
        lambda event_id: [
            PhotoRecord(
                id="photo-1",
                event_id=event_id,
                cloudinary_url="https://example.com/photo-1.jpg",
                thumbnail_url="https://example.com/photo-1-thumb.jpg",
                uploaded_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
                face_count=3,
            ),
            PhotoRecord(
                id="photo-2",
                event_id=event_id,
                cloudinary_url="https://example.com/photo-2.jpg",
                thumbnail_url="https://example.com/photo-2-thumb.jpg",
                uploaded_at=datetime(2026, 4, 19, tzinfo=timezone.utc),
                face_count=1,
            ),
        ],
    )

    response = gallery_service.get_shared_event_gallery(token)

    assert response.shared_by.id == "creator-1"
    assert [photo.id for photo in response.photos] == ["photo-1", "photo-2"]
    assert response.download_all_url is None


def test_list_event_photos_falls_back_when_original_filename_column_is_missing(monkeypatch) -> None:
    class _Query:
        def __init__(self, client) -> None:
            self.client = client
            self.selected = ""

        def select(self, selected: str):
            self.selected = selected
            return self

        def eq(self, _key: str, _value: str):
            return self

        def order(self, _key: str, desc: bool = False):
            return self

        def execute(self):
            self.client.calls.append(self.selected)
            if "original_filename" in self.selected:
                raise Exception("column photos.original_filename does not exist")
            return type(
                "Response",
                (),
                {
                    "data": [
                        {
                            "id": "photo-1",
                            "event_id": "event-1",
                            "cloudinary_url": "https://example.com/photo.jpg",
                            "thumbnail_url": "https://example.com/photo-thumb.jpg",
                            "uploaded_at": datetime(2026, 4, 18, tzinfo=timezone.utc),
                            "face_count": 2,
                        }
                    ]
                },
            )()

    class _Client:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def table(self, _name: str):
            return _Query(self)

    client = _Client()
    monkeypatch.setattr(gallery_service, "get_supabase_admin_client", lambda: client)

    photos = gallery_service._list_event_photos("event-1")

    assert [photo.id for photo in photos] == ["photo-1"]
    assert client.calls == [
        "id,event_id,uploaded_by,uploader_name,cloudinary_url,thumbnail_url,original_filename,uploaded_at,face_count",
        "id,event_id,uploaded_by,uploader_name,cloudinary_url,thumbnail_url,uploaded_at,face_count",
    ]
