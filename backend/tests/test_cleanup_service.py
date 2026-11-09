"""Cleanup safety tests."""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace

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

    monkeypatch.setattr(cleanup_service, "iter_event_photo_asset_pages", lambda eventId: iter([[{"cloudinary_id": "pictureme/events/event-1/asset-1"}]]))
    monkeypatch.setattr(cleanup_service, "_mark_cleanup_started", lambda eventId: None)
    monkeypatch.setattr(cleanup_service, "delete_event_photo_assets", lambda public_ids: {"pictureme/events/event-1/asset-1": "error"})
    monkeypatch.setattr(cleanup_service, "_delete_rekognition_collection_safe", lambda _collection_id, _errors: True)
    monkeypatch.setattr(cleanup_service, "_release_collection_reservation", lambda collectionId: None)
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


def test_unknown_cover_reference_blocks_expiry_finalization(monkeypatch) -> None:
    event = EventRecord(
        id="event-1", creator_id="creator-1", name="Expo", date=date(2026, 4, 18),
        join_token="join-token", rekognition_collection_id="collection-1",
        cover_url="https://unknown.example/cover.jpg", status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(cleanup_service, "_mark_cleanup_started", lambda eventId: None)
    monkeypatch.setattr(cleanup_service, "iter_event_photo_asset_pages", lambda eventId: iter([]))
    monkeypatch.setattr(cleanup_service, "getSettings", lambda: SimpleNamespace(event_cover_folder="pictureme/event-covers"))
    monkeypatch.setattr(cleanup_service, "cloudinary_public_id_from_url", lambda url, prefix: None)
    monkeypatch.setattr(cleanup_service, "_delete_rekognition_collection_safe", lambda collectionId, errors: True)
    monkeypatch.setattr(cleanup_service, "_release_collection_reservation", lambda collectionId: None)
    monkeypatch.setattr(cleanup_service, "_delete_rows", lambda table, eventId: (_ for _ in ()).throw(
        AssertionError("database rows must remain")
    ))

    result = cleanup_service._cleanup_one_event(event)

    assert result.status == "failed"
    assert "Event cover asset ID requires provider review" in result.errors

