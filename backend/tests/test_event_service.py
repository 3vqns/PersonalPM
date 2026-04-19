"""Targeted event-service tests for permissions and async triggers."""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace

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
    def insert(self, _payload):
        return self

    def execute(self):
        return SimpleNamespace(data={"id": "membership-1"})


class _FakeClient:
    def table(self, _name: str):
        return _FakeTable()


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
            face_profile_completed=True,
            face_profile_updated_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
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

