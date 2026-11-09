"""Bounded enrollment downloads for legacy remote selfie assets."""

from io import BytesIO
from types import SimpleNamespace

import pytest

from backend.errors import AppError
from backend.schemas.account import FaceProfileImageRecord
from backend.services import matching_service


def test_legacy_cloudinary_selfie_download_stops_at_limit_plus_one(monkeypatch) -> None:
    class TrackingResponse(BytesIO):
        def __exit__(self, excType, excValue, traceback):
            return False

    response = TrackingResponse(b"123456789")
    monkeypatch.setattr(matching_service, "getSettings", lambda: SimpleNamespace(max_face_profile_selfie_size_bytes=4))
    monkeypatch.setattr(matching_service, "urlopen", lambda url, timeout: response)
    asset = FaceProfileImageRecord(
        id="selfie-1", user_id="user-1", storage_path="legacy.jpg",
        cloudinary_url="https://res.cloudinary.com/example/image/upload/legacy.jpg", sort_order=1,
    )
    with pytest.raises(AppError) as excInfo:
        matching_service._download_face_profile_image(asset)
    assert excInfo.value.code == "SELFIE_TOO_LARGE"
    assert response.tell() == 5
