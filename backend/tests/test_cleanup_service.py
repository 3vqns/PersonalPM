"""Cleanup safety tests."""

from __future__ import annotations

from datetime import date, datetime, timezone

from backend.schemas.event import EventRecord
from backend.services import cleanup_service


def test_cleanup_does_not_finalize_db_when_external_cleanup_fails(monkeypatch) -> None:
    event = EventRecord(
        id="event-1",
        creator_id="creator-1",
        name="Expo",
        description=None,
        date=date(2026, 4, 18),
        expires_at=datetime(2026, 4, 19, tzinfo=timezone.utc),
        join_token="join-token",
        rekognition_collection_id="collection-1",
        cover_url=None,
        status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    finalize_called = {"rows": False, "photos": False, "event": False}

    monkeypatch.setattr(cleanup_service, "_list_event_photo_assets", lambda _event_id: [{"cloudinary_id": "asset-1"}])
    monkeypatch.setattr(cleanup_service, "delete_event_photo_assets", lambda public_ids: {"asset-1": "error"})
    monkeypatch.setattr(cleanup_service, "_delete_rekognition_collection_safe", lambda _collection_id, _errors: True)
    monkeypatch.setattr(
        cleanup_service,
        "_delete_rows",
        lambda _table, _event_id: finalize_called.__setitem__("rows", True),
    )
    monkeypatch.setattr(
        cleanup_service,
        "_clear_photo_delivery_fields",
        lambda _event_id: finalize_called.__setitem__("photos", True),
    )
    monkeypatch.setattr(
        cleanup_service,
        "_mark_event_expired",
        lambda _event_id: finalize_called.__setitem__("event", True),
    )

    result = cleanup_service._cleanup_one_event(event)

    assert result.status == "failed"
    assert finalize_called == {"rows": False, "photos": False, "event": False}

