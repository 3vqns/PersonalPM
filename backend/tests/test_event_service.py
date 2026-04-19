"""Targeted event-service tests for permissions and async triggers."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from io import BytesIO
from types import SimpleNamespace

from fastapi import UploadFile
from starlette.datastructures import Headers

from backend.dependencies.auth import AuthenticatedUser
from backend.schemas.account import PublicUserRecord
from backend.schemas.event import EventRecord
from backend.services import event_service


class FakeBackgroundTasks:
    """Minimal background task collector for service tests."""

    def __init__(self) -> None:
        self.tasks: list[tuple[object, tuple, dict]] = []

    def add_task(self, func, *args, **kwargs) -> None:
        self.tasks.append((func, args, kwargs))


class _FakeTable:
    def __init__(self, name: str, client: "_FakeClient") -> None:
        self.name = name
        self.client = client
        self.last_payload = None

    def insert(self, _payload):
        self.last_payload = _payload
        if self.name == "events":
            self.client.inserted_event_payloads.append(_payload)
        return self

    def update(self, payload):
        self.last_payload = payload
        if self.name == "events":
            self.client.updated_event_payloads.append(payload)
        return self

    def delete(self):
        return self

    def eq(self, _key: str, _value: str):
        return self

    def upsert(self, payload, on_conflict=None):
        self.last_payload = payload
        if self.name == "event_members":
            self.client.upserted_memberships.append((payload, on_conflict))
        return self

    def select(self, *_args, **_kwargs):
        return self

    def single(self):
        return self

    def limit(self, _count: int):
        return self

    def execute(self):
        if self.name == "events" and self.client.inserted_event_payloads:
            return SimpleNamespace(data={"id": "event-1"})
        return SimpleNamespace(data={"id": "membership-1"})


class _FakeClient:
    def __init__(self) -> None:
        self.inserted_event_payloads: list[dict] = []
        self.updated_event_payloads: list[dict] = []
        self.upserted_memberships: list[tuple[dict, str | None]] = []

    def table(self, _name: str):
        return _FakeTable(_name, self)


def _build_upload_file(name: str, content: bytes = b"cover-bytes") -> UploadFile:
    return UploadFile(filename=name, file=BytesIO(content), headers=Headers({"content-type": "image/jpeg"}))


def test_join_event_enqueues_matching_for_face_profile(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="user-1",
        email="user@example.com",
        access_token="token",
        raw_user={"id": "user-1", "email": "user@example.com"},
    )
    event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Launch Party",
        description=None,
        date=date(2026, 4, 18),
        expires_at=datetime(2026, 4, 25, tzinfo=timezone.utc),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    background_tasks = FakeBackgroundTasks()

    monkeypatch.setattr(event_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(
        event_service,
        "get_public_user_record",
        lambda _current_user: PublicUserRecord(
            id=current_user.user_id,
            email=current_user.email or "",
            name="User One",
            avatar_url=None,
            face_indexed_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
            rekognition_face_id=None,
        ),
    )
    monkeypatch.setattr(event_service, "_get_membership", lambda _event_id, _user_id: None)
    monkeypatch.setattr(event_service, "get_supabase_admin_client", lambda: _FakeClient())

    response = event_service.join_event(current_user, event_id=event.id, background_tasks=background_tasks)

    assert response.event_id == event.id
    assert response.already_joined is False
    assert background_tasks.tasks
    queued_func, _args, kwargs = background_tasks.tasks[0]
    assert queued_func is event_service.trigger_user_event_match
    assert kwargs == {"user_id": current_user.user_id, "event_id": event.id, "reason": "event-join"}


def test_create_event_uploads_cover_when_provided(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="user-1",
        email="user@example.com",
        access_token="token",
        raw_user={"id": "user-1", "email": "user@example.com"},
    )
    client = _FakeClient()

    monkeypatch.setattr(
        event_service,
        "get_public_user_record",
        lambda _current_user: PublicUserRecord(
            id=current_user.user_id,
            email=current_user.email or "",
            name="User One",
            avatar_url=None,
            face_indexed_at=None,
            rekognition_face_id=None,
        ),
    )
    monkeypatch.setattr(
        event_service,
        "getSettings",
        lambda: SimpleNamespace(
            rekognition_collection_prefix="pictureme-event",
            external_retry_attempts=1,
            external_retry_backoff_seconds=0.0,
        ),
    )
    monkeypatch.setattr(event_service, "run_with_retries", lambda **_kwargs: None)
    monkeypatch.setattr(event_service, "get_supabase_admin_client", lambda: client)
    monkeypatch.setattr(
        event_service,
        "upload_event_cover",
        lambda **_kwargs: asyncio.sleep(0, result="https://cdn.example.com/event-cover.jpg"),
    )

    response = asyncio.run(
        event_service.create_event(
            current_user,
            name="Launch Party",
            date_value=date(2026, 4, 18),
            description="Night one",
            cover=_build_upload_file("cover.jpg"),
        )
    )

    assert response.id == "event-1"
    assert client.inserted_event_payloads
    assert client.updated_event_payloads == [{"cover_url": "https://cdn.example.com/event-cover.jpg"}]
    assert client.upserted_memberships == [
        (
            {
                "event_id": "event-1",
                "user_id": current_user.user_id,
                "role": "creator",
            },
            "event_id,user_id",
        )
    ]


def test_create_event_ignores_empty_cover_upload(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="user-1",
        email="user@example.com",
        access_token="token",
        raw_user={"id": "user-1", "email": "user@example.com"},
    )
    client = _FakeClient()
    upload_called = False

    monkeypatch.setattr(
        event_service,
        "get_public_user_record",
        lambda _current_user: PublicUserRecord(
            id=current_user.user_id,
            email=current_user.email or "",
            name="User One",
            avatar_url=None,
            face_indexed_at=None,
            rekognition_face_id=None,
        ),
    )
    monkeypatch.setattr(
        event_service,
        "getSettings",
        lambda: SimpleNamespace(
            rekognition_collection_prefix="pictureme-event",
            external_retry_attempts=1,
            external_retry_backoff_seconds=0.0,
        ),
    )
    monkeypatch.setattr(event_service, "run_with_retries", lambda **_kwargs: None)
    monkeypatch.setattr(event_service, "get_supabase_admin_client", lambda: client)

    async def _unexpected_cover_upload(**_kwargs):
        nonlocal upload_called
        upload_called = True
        return "https://cdn.example.com/event-cover.jpg"

    monkeypatch.setattr(event_service, "upload_event_cover", _unexpected_cover_upload)

    response = asyncio.run(
        event_service.create_event(
            current_user,
            name="Launch Party",
            date_value=date(2026, 4, 18),
            description="Night one",
            cover=_build_upload_file("cover.jpg", b""),
        )
    )

    assert response.id == "event-1"
    assert upload_called is False
    assert client.inserted_event_payloads
    assert client.updated_event_payloads == []


def test_get_membership_returns_none_when_no_membership_row(monkeypatch) -> None:
    class _NoMembershipTable:
        def select(self, *_args, **_kwargs):
            return self

        def eq(self, _key: str, _value: str):
            return self

        def limit(self, _count: int):
            return self

        def execute(self):
            return SimpleNamespace(data=[])

    class _NoMembershipClient:
        def table(self, name: str):
            assert name == "event_members"
            return _NoMembershipTable()

    monkeypatch.setattr(event_service, "get_supabase_admin_client", lambda: _NoMembershipClient())

    assert event_service._get_membership("event-1", "user-1") is None
