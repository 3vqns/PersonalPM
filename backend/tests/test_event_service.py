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
from backend.schemas.event import EventMemberRecord, EventRecord, PhotoRecord
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
        if self.name == "event_gallery_access":
            self.client.upserted_gallery_access.append((payload, on_conflict))
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
        self.upserted_gallery_access: list[tuple[dict, str | None]] = []

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
    client = _FakeClient()
    monkeypatch.setattr(event_service, "get_supabase_admin_client", lambda: client)

    response = event_service.join_event(current_user, event_id=event.id, background_tasks=background_tasks)

    assert response.event_id == event.id
    assert response.already_joined is False
    assert client.upserted_memberships == [
        (
            {
                "event_id": event.id,
                "user_id": current_user.user_id,
                "role": "member",
            },
            "event_id,user_id",
        )
    ]
    assert client.upserted_gallery_access == []
    assert background_tasks.tasks
    queued_func, _args, kwargs = background_tasks.tasks[0]
    assert queued_func is event_service.trigger_user_event_match
    assert kwargs == {"user_id": current_user.user_id, "event_id": event.id, "reason": "event-join"}


def test_join_stale_private_event_flag_still_adds_member(monkeypatch) -> None:
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
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
        private_gallery=True,
    )
    client = _FakeClient()

    monkeypatch.setattr(event_service, "_get_event_or_404", lambda _event_id: event)
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
    monkeypatch.setattr(event_service, "_get_membership", lambda _event_id, _user_id: None)
    monkeypatch.setattr(event_service, "get_supabase_admin_client", lambda: client)

    response = event_service.join_event(current_user, event_id=event.id, background_tasks=FakeBackgroundTasks())

    assert response.role == "member"
    assert response.gallery_access_status == "approved"
    assert client.upserted_memberships == [
        (
            {
                "event_id": "event-1",
                "user_id": "user-1",
                "role": "member",
            },
            "event_id,user_id",
        )
    ]
    assert client.upserted_gallery_access == []


def test_join_public_event_uses_membership_only_for_existing_member(monkeypatch) -> None:
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
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    membership = EventMemberRecord(
        id="member-1",
        event_id=event.id,
        user_id=current_user.user_id,
        role="member",
        joined_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    client = _FakeClient()

    monkeypatch.setattr(event_service, "_get_event_by_join_token", lambda _token: event)
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
    monkeypatch.setattr(event_service, "_get_membership", lambda _event_id, _user_id: membership)
    monkeypatch.setattr(event_service, "get_supabase_admin_client", lambda: client)

    response = event_service.join_event_by_token(current_user, token="join-token", background_tasks=FakeBackgroundTasks())

    assert response.already_joined is True
    assert response.event_id == event.id
    assert client.upserted_memberships == []
    assert client.upserted_gallery_access == []


def test_public_gallery_access_status_ignores_access_rows(monkeypatch) -> None:
    event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Launch Party",
        description=None,
        date=date(2026, 4, 18),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    membership = EventMemberRecord(
        id="member-1",
        event_id=event.id,
        user_id="user-1",
        role="member",
        joined_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )

    monkeypatch.setattr(event_service, "_get_membership", lambda _event_id, user_id: membership if user_id == "user-1" else None)
    monkeypatch.setattr(
        event_service,
        "_get_gallery_access_status",
        lambda _event_id, _user_id: (_ for _ in ()).throw(AssertionError("public events must not query gallery access")),
    )

    assert event_service._get_public_gallery_access_status(event, "user-1") == "approved"
    assert event_service._get_public_gallery_access_status(event, "user-2") == "none"


def test_request_access_for_public_event_only_ensures_membership(monkeypatch) -> None:
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
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    ensured_members: list[tuple[str, str]] = []

    monkeypatch.setattr(event_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(event_service, "_ensure_event_member", lambda **kwargs: ensured_members.append((kwargs["event_id"], kwargs["user_id"])))
    monkeypatch.setattr(
        event_service,
        "_upsert_gallery_access",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("public events must not write gallery access")),
    )

    response = event_service.request_gallery_access(current_user, event_id=event.id)

    assert response.status == "approved"
    assert ensured_members == [("event-1", "user-1")]


def test_remove_event_member_deletes_membership_access_and_matches(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="creator-1",
        email="creator@example.com",
        access_token="token",
        raw_user={"id": "creator-1", "email": "creator@example.com"},
    )
    event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Launch Party",
        description=None,
        date=date(2026, 4, 18),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    deleted_filters: list[tuple[str, dict[str, str]]] = []

    class _DeleteTable:
        def __init__(self, name: str) -> None:
            self.name = name
            self.filters: dict[str, str] = {}

        def delete(self):
            return self

        def eq(self, key: str, value: str):
            self.filters[key] = value
            return self

        def execute(self):
            deleted_filters.append((self.name, self.filters))
            return SimpleNamespace(data=[])

    class _DeleteClient:
        def table(self, name: str):
            return _DeleteTable(name)

    monkeypatch.setattr(event_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(event_service, "_require_event_manager", lambda _user_id, _event: "creator")
    monkeypatch.setattr(
        event_service,
        "_get_membership",
        lambda _event_id, _user_id: EventMemberRecord(
            id="membership-1",
            event_id="event-1",
            user_id="user-1",
            role="member",
            joined_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
        ),
    )
    monkeypatch.setattr(event_service, "get_supabase_admin_client", lambda: _DeleteClient())

    response = event_service.remove_event_member(current_user, event_id=event.id, member_user_id="user-1")

    assert response == {"success": True}
    assert deleted_filters == [
        ("event_gallery_access", {"event_id": "event-1", "user_id": "user-1"}),
        ("user_photo_matches", {"event_id": "event-1", "user_id": "user-1"}),
        ("event_members", {"event_id": "event-1", "user_id": "user-1"}),
    ]


def test_invite_gallery_access_by_email_adds_event_member(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="creator-1",
        email="creator@example.com",
        access_token="token",
        raw_user={"id": "creator-1", "email": "creator@example.com"},
    )
    event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Launch Party",
        description=None,
        date=date(2026, 4, 18),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
        private_gallery=True,
    )
    invited_user = PublicUserRecord(
        id="user-2",
        email="alex@example.com",
        name="Alex",
        avatar_url=None,
        face_indexed_at=None,
        rekognition_face_id=None,
    )
    ensured_members: list[tuple[str, str]] = []

    monkeypatch.setattr(event_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(event_service, "_get_membership", lambda _event_id, _user_id: None)
    monkeypatch.setattr(event_service, "_get_public_user_by_email", lambda _email: invited_user)
    monkeypatch.setattr(event_service, "_ensure_event_member", lambda **kwargs: ensured_members.append((kwargs["event_id"], kwargs["user_id"])))
    monkeypatch.setattr(
        event_service,
        "_upsert_gallery_access",
        lambda **_kwargs: {
            "id": "access-1",
            "status": "approved",
            "requested_at": datetime(2026, 4, 18, tzinfo=timezone.utc),
            "approved_at": datetime(2026, 4, 18, tzinfo=timezone.utc),
        },
    )

    response = event_service.invite_gallery_access_by_email(
        current_user,
        event_id=event.id,
        email="alex@example.com",
    )

    assert ensured_members == [("event-1", "user-2")]
    assert response.status == "approved"


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
    assert client.inserted_event_payloads[0]["tags"] == []
    assert client.inserted_event_payloads[0]["allow_anyone_upload"] is False
    assert "expires_at" not in client.inserted_event_payloads[0]
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
    assert "expires_at" not in client.inserted_event_payloads[0]
    assert client.updated_event_payloads == []


def test_update_event_uploads_replacement_cover(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="creator-1",
        email="creator@example.com",
        access_token="token",
        raw_user={"id": "creator-1", "email": "creator@example.com"},
    )
    event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Launch Party",
        description=None,
        date=date(2026, 4, 18),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url="https://cdn.example.com/old-cover.jpg",
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    client = _FakeClient()

    monkeypatch.setattr(event_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(event_service, "get_supabase_admin_client", lambda: client)
    monkeypatch.setattr(
        event_service,
        "upload_event_cover",
        lambda **_kwargs: asyncio.sleep(0, result="https://cdn.example.com/new-cover.jpg"),
    )
    monkeypatch.setattr(event_service, "get_event_detail", lambda *_args, **_kwargs: SimpleNamespace(id="event-1"))

    asyncio.run(
        event_service.update_event(
            current_user,
            event_id=event.id,
            payload=event_service.EventUpdateRequest(),
            cover=_build_upload_file("new-cover.jpg"),
        )
    )

    assert client.updated_event_payloads == [{"cover_url": "https://cdn.example.com/new-cover.jpg"}]


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


def test_list_event_members_redacts_other_member_emails(monkeypatch) -> None:
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
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    joined_at = datetime(2026, 4, 18, tzinfo=timezone.utc)
    rows = [
        EventMemberRecord(id="member-1", event_id=event.id, user_id="user-1", role="member", joined_at=joined_at),
        EventMemberRecord(id="member-2", event_id=event.id, user_id="user-2", role="member", joined_at=joined_at),
    ]
    users = {
        "user-1": PublicUserRecord(
            id="user-1",
            email="user@example.com",
            name="User One",
            avatar_url=None,
            face_indexed_at=None,
            rekognition_face_id=None,
        ),
        "user-2": PublicUserRecord(
            id="user-2",
            email="other@example.com",
            name="User Two",
            avatar_url=None,
            face_indexed_at=None,
            rekognition_face_id=None,
        ),
    }

    monkeypatch.setattr(event_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(event_service, "_require_event_role", lambda _user_id, _event: "member")
    monkeypatch.setattr(event_service, "_fetch_event_member_rows", lambda _event_id: rows)
    monkeypatch.setattr(event_service, "_get_public_user_by_id", lambda user_id: users[user_id])

    response = event_service.list_event_members(current_user, event_id=event.id)

    emails_by_user_id = {member.user_id: member.email for member in response}
    assert emails_by_user_id == {
        "user-1": "user@example.com",
        "user-2": "",
    }


def test_list_event_members_shows_all_emails_to_admins(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="admin-1",
        email="admin@example.com",
        access_token="token",
        raw_user={"id": "admin-1", "email": "admin@example.com"},
    )
    event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Launch Party",
        description=None,
        date=date(2026, 4, 18),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    joined_at = datetime(2026, 4, 18, tzinfo=timezone.utc)
    rows = [
        EventMemberRecord(id="member-1", event_id=event.id, user_id="admin-1", role="admin", joined_at=joined_at),
        EventMemberRecord(id="member-2", event_id=event.id, user_id="user-2", role="member", joined_at=joined_at),
    ]
    users = {
        "admin-1": PublicUserRecord(
            id="admin-1",
            email="admin@example.com",
            name="Admin One",
            avatar_url=None,
            face_indexed_at=None,
            rekognition_face_id=None,
        ),
        "user-2": PublicUserRecord(
            id="user-2",
            email="other@example.com",
            name="User Two",
            avatar_url=None,
            face_indexed_at=None,
            rekognition_face_id=None,
        ),
    }

    monkeypatch.setattr(event_service, "_get_event_or_404", lambda _event_id: event)
    monkeypatch.setattr(event_service, "_require_event_role", lambda _user_id, _event: "admin")
    monkeypatch.setattr(event_service, "_fetch_event_member_rows", lambda _event_id: rows)
    monkeypatch.setattr(event_service, "_get_public_user_by_id", lambda user_id: users[user_id])

    response = event_service.list_event_members(current_user, event_id=event.id)

    emails_by_user_id = {member.user_id: member.email for member in response}
    assert emails_by_user_id == {
        "admin-1": "admin@example.com",
        "user-2": "other@example.com",
    }


def test_get_public_event_gallery_returns_join_preview_and_photos(monkeypatch) -> None:
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

    monkeypatch.setattr(event_service, "_get_event_by_join_token", lambda _token: event)
    monkeypatch.setattr(
        event_service,
        "_get_public_user_by_id",
        lambda _user_id: PublicUserRecord(
            id="creator-1",
            email="creator@example.com",
            name="Taylor",
            avatar_url=None,
            face_indexed_at=None,
            rekognition_face_id=None,
        ),
    )
    monkeypatch.setattr(event_service, "_count_rows", lambda _table, _filters: 3)
    monkeypatch.setattr(
        event_service,
        "_list_public_event_photos",
        lambda _event_id: [
            PhotoRecord(
                id="photo-1",
                event_id="event-1",
                cloudinary_url="https://example.com/photo.jpg",
                thumbnail_url="https://example.com/photo-thumb.jpg",
                uploaded_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
                face_count=1,
            )
        ],
    )

    response = event_service.get_public_event_gallery("join-token")

    assert response.event.join_token == "join-token"
    assert [photo.id for photo in response.photos] == ["photo-1"]
