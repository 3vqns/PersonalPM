"""Matching pipeline dedupe tests."""

from __future__ import annotations

from datetime import date, datetime, timezone

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
            storage_bucket="bucket",
            storage_path="users/user-1/face-profile/01.jpg",
            content_type="image/jpeg",
            byte_size=128,
            sort_order=1,
            created_at=datetime(2026, 4, 18, tzinfo=timezone.utc),
        ),
        FaceProfileImageRecord(
            id="selfie-2",
            user_id="user-1",
            storage_bucket="bucket",
            storage_path="users/user-1/face-profile/02.jpg",
            content_type="image/jpeg",
            byte_size=256,
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

