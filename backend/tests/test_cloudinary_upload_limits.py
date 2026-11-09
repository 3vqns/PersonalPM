"""Browser image reads stop at the configured byte boundary."""

import asyncio
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from backend.errors import AppError
from backend.services import cloudinary_service


@pytest.mark.parametrize("kind", ["avatar", "cover"])
def test_browser_image_rejects_before_full_read(monkeypatch, kind: str) -> None:
    monkeypatch.setattr(cloudinary_service, "getSettings", lambda: SimpleNamespace(
        account_avatar_folder="avatars", event_cover_folder="covers",
        max_account_avatar_size_bytes=4, max_event_cover_size_bytes=4,
    ))
    upload = UploadFile(filename="large.jpg", file=BytesIO(b"123456789"), headers=Headers({"content-type": "image/jpeg"}))
    with pytest.raises(AppError) as excInfo:
        if kind == "avatar":
            asyncio.run(cloudinary_service.upload_account_avatar(user_id="user-1", upload=upload))
        else:
            asyncio.run(cloudinary_service.upload_event_cover(event_id="event-1", upload=upload))
    assert excInfo.value.code == "IMAGE_TOO_LARGE"
    assert upload.file.tell() == 5


def test_public_id_recovery_rejects_other_cloud(monkeypatch) -> None:
    monkeypatch.setattr(cloudinary_service, "getSettings", lambda: SimpleNamespace(cloudinary_cloud_name_value="pictureme"))
    url = "https://res.cloudinary.com/other/image/upload/v123/pictureme/events/event-1/photo.jpg"

    assert cloudinary_service.cloudinary_public_id_from_url(url, "pictureme/events/event-1") is None
