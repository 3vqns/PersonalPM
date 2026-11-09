"""Matching pipeline dedupe tests."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from backend.errors import AppError
from backend.schemas.account import FaceProfileImageRecord
from backend.schemas.event import EventRecord
from backend.services import matching_service


def test_collect_best_photo_scores_deduplicates_across_selfies_and_faces(monkeypatch) -> None:
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
    selfies = [
        FaceProfileImageRecord(
            id="selfie-1",
            user_id="user-1",
            storage_path="users/user-1/face-profile/01.jpg",
            cloudinary_url="https://res.cloudinary.com/pictureme/image/upload/v1/pictureme/face-profiles/user-1/01.jpg",
            sort_order=1,
            created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
        ),
        FaceProfileImageRecord(
            id="selfie-2",
            user_id="user-1",
            storage_path="users/user-1/face-profile/02.jpg",
            cloudinary_url="https://res.cloudinary.com/pictureme/image/upload/v1/pictureme/face-profiles/user-1/02.jpg",
            sort_order=2,
            created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
        ),
    ]

    monkeypatch.setattr(matching_service, "_download_face_profile_image", lambda _asset: b"image-bytes")
    monkeypatch.setattr(
        matching_service,
        "_search_faces_by_image",
        lambda **kwargs: {"face-1": 90.0, "face-2": 70.0}
        if kwargs["storage_path"].endswith("01.jpg")
        else {"face-1": 88.0, "face-3": 95.0},
    )
    monkeypatch.setattr(
        matching_service,
        "_map_face_ids_to_photo_ids",
        lambda _face_ids, _event_id: {
            "face-1": "photo-a",
            "face-2": "photo-a",
            "face-3": "photo-b",
        },
    )

    result = matching_service._collect_best_photo_scores(event=event, selfie_assets=selfies)

    assert result == {"photo-a": 90.0, "photo-b": 95.0}


def test_removed_face_profile_cannot_restore_in_flight_matches(monkeypatch) -> None:
    event = EventRecord(
        id="event-1", creator_id="creator-1", name="Expo", date=date(2026, 4, 18),
        join_token="join-token", rekognition_collection_id="collection-1", status="active",
        created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
    )
    asset = FaceProfileImageRecord(
        id="selfie-1", user_id="user-1", storage_path="user-1/one.jpg", sort_order=1,
    )
    reads = 0

    def currentAssets(userId):
        nonlocal reads
        reads += 1
        return [asset] if reads == 1 else []

    monkeypatch.setattr(matching_service, "_get_active_event_or_none", lambda eventId: event)
    monkeypatch.setattr(matching_service, "_user_has_event_access", lambda userId, currentEvent: True)
    monkeypatch.setattr(matching_service, "_list_matchable_face_profile_images", currentAssets)
    monkeypatch.setattr(matching_service, "_collect_best_photo_scores", lambda **kwargs: {"photo-1": 90.0})
    monkeypatch.setattr(matching_service, "_persist_user_photo_matches", lambda **kwargs: (_ for _ in ()).throw(
        AssertionError("stale match must not be saved")
    ))

    matching_service._run_user_event_match(user_id="user-1", event_id="event-1", reason="test")
    assert reads == 2


def test_untrusted_legacy_selfie_url_is_not_downloaded(monkeypatch) -> None:
    asset = FaceProfileImageRecord(
        id="selfie-1", user_id="user-1", storage_path="https://example.com/selfie.jpg", sort_order=1,
    )
    monkeypatch.setattr(matching_service, "urlopen", lambda *args, **kwargs: pytest.fail("remote request started"))

    with pytest.raises(AppError) as excInfo:
        matching_service._download_face_profile_image(asset)
    assert excInfo.value.code == "SELFIE_LOCATION_UNTRUSTED"


def test_other_account_private_selfie_is_not_downloaded(monkeypatch) -> None:
    asset = FaceProfileImageRecord(
        id="selfie-1", user_id="user-1", storage_path="user-2/selfie.jpg", sort_order=1,
    )
    monkeypatch.setattr(
        matching_service, "get_supabase_admin_client", lambda: pytest.fail("private storage request started")
    )

    with pytest.raises(AppError) as excInfo:
        matching_service._download_face_profile_image(asset)
    assert excInfo.value.code == "SELFIE_LOCATION_UNTRUSTED"
