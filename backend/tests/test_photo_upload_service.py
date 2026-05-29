"""Upload orchestration guardrail tests."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from io import BytesIO
from types import SimpleNamespace
from zipfile import ZipFile

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from backend.dependencies.auth import AuthenticatedUser
from backend.errors import AppError
from backend.schemas.event import EventRecord
from backend.schemas.upload import StagedUploadFile
from backend.services import photo_upload_service


class FakeBackgroundTasks:
    """Collect scheduled tasks without running them."""

    def __init__(self) -> None:
        self.tasks: list[tuple[object, tuple, dict]] = []

    def add_task(self, func, *args, **kwargs) -> None:
        self.tasks.append((func, args, kwargs))


def _build_upload_file(name: str) -> UploadFile:
    return UploadFile(filename=name, file=BytesIO(b"image-bytes"), headers=Headers({"content-type": "image/jpeg"}))


def _build_zip_upload_file(name: str, members: dict[str, bytes]) -> UploadFile:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        for member_name, content in members.items():
            archive.writestr(member_name, content)
    buffer.seek(0)
    return UploadFile(
        filename=name,
        file=buffer,
        headers=Headers({"content-type": "application/zip"}),
    )


def _build_event() -> EventRecord:
    return EventRecord(
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


def test_upload_batch_rejects_too_many_files(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="user-1",
        email="user@example.com",
        access_token="token",
        raw_user={"id": "user-1", "email": "user@example.com"},
    )
    monkeypatch.setattr(photo_upload_service, "_require_upload_access", lambda _user_id, _event_id: (_build_event(), "creator"))
    monkeypatch.setattr(
        photo_upload_service,
        "getSettings",
        lambda: SimpleNamespace(max_event_upload_batch_files=1, max_event_photo_size_bytes=15 * 1024 * 1024),
    )

    with pytest.raises(AppError) as exc_info:
        asyncio.run(
            photo_upload_service.start_event_upload_batch(
                current_user,
                event_id="event-1",
                files=[_build_upload_file("one.jpg"), _build_upload_file("two.jpg")],
                background_tasks=FakeBackgroundTasks(),
            )
        )

    assert exc_info.value.code == "UPLOAD_BATCH_TOO_LARGE"


def test_upload_batch_schedules_background_processing(monkeypatch) -> None:
    current_user = AuthenticatedUser(
        user_id="user-1",
        email="user@example.com",
        access_token="token",
        raw_user={"id": "user-1", "email": "user@example.com"},
    )
    background_tasks = FakeBackgroundTasks()
    event = _build_event()
    staged_file = StagedUploadFile(file_name="one.jpg", content_type="image/jpeg", byte_size=11, content=b"image-bytes")

    monkeypatch.setattr(photo_upload_service, "_require_upload_access", lambda _user_id, _event_id: (event, "creator"))

    async def _fake_stage_upload_files(_event_id, _files):
        return [staged_file]

    monkeypatch.setattr(photo_upload_service, "_stage_upload_files", _fake_stage_upload_files)
    monkeypatch.setattr(photo_upload_service, "uuid4", lambda: SimpleNamespace(hex="job1"))

    response = asyncio.run(
        photo_upload_service.start_event_upload_batch(
            current_user,
            event_id=event.id,
            files=[_build_upload_file("one.jpg")],
            background_tasks=background_tasks,
        )
    )

    assert response.job_id == "upload-job1"
    assert len(background_tasks.tasks) == 1
    queued_func, args, _kwargs = background_tasks.tasks[0]
    assert queued_func is photo_upload_service._process_upload_job
    assert args[0] == "upload-job1"


def test_stage_upload_files_expands_zip_images(monkeypatch) -> None:
    monkeypatch.setattr(photo_upload_service, "_existing_filename_keys", lambda _event_id: set())
    monkeypatch.setattr(
        photo_upload_service,
        "getSettings",
        lambda: SimpleNamespace(
            max_event_photo_size_bytes=15 * 1024 * 1024,
            max_event_upload_archive_size_bytes=50 * 1024 * 1024,
            max_event_upload_batch_files=250,
        ),
    )

    zip_upload = _build_zip_upload_file(
        "batch.zip",
        {
            "folder/one.jpg": b"one",
            "two.png": b"two",
        },
    )

    staged = asyncio.run(photo_upload_service._stage_upload_files("event-1", [zip_upload]))

    assert [file.file_name for file in staged] == ["one.jpg", "two.png"]
    assert [file.content_type for file in staged] == ["image/jpeg", "image/png"]


def test_stage_upload_files_rejects_duplicate_filename_against_existing_gallery(monkeypatch) -> None:
    monkeypatch.setattr(photo_upload_service, "_existing_filename_keys", lambda _event_id: {"one.jpg"})
    monkeypatch.setattr(
        photo_upload_service,
        "getSettings",
        lambda: SimpleNamespace(
            max_event_photo_size_bytes=15 * 1024 * 1024,
            max_event_upload_archive_size_bytes=50 * 1024 * 1024,
            max_event_upload_batch_files=250,
        ),
    )

    with pytest.raises(AppError) as exc_info:
        asyncio.run(
            photo_upload_service._stage_upload_files(
                "event-1",
                [_build_upload_file("one.jpg")],
            )
        )

    assert exc_info.value.code == "DUPLICATE_UPLOAD_FILENAME"


def test_delete_event_photo_allows_admin_cleanup(monkeypatch) -> None:
    class _DeleteQuery:
        def __init__(self, client, table_name: str) -> None:
            self.client = client
            self.table_name = table_name
            self.filters: dict[str, str] = {}

        def delete(self):
            return self

        def eq(self, key: str, value: str):
            self.filters[key] = value
            return self

        def execute(self):
            self.client.calls.append((self.table_name, dict(self.filters)))
            return SimpleNamespace(data={})

    class _DeleteClient:
        def __init__(self) -> None:
            self.calls: list[tuple[str, dict[str, str]]] = []

        def table(self, name: str):
            return _DeleteQuery(self, name)

    client = _DeleteClient()
    current_user = AuthenticatedUser(
        user_id="admin-1",
        email="admin@example.com",
        access_token="token",
        raw_user={"id": "admin-1", "email": "admin@example.com"},
    )

    monkeypatch.setattr(photo_upload_service, "get_supabase_admin_client", lambda: client)
    monkeypatch.setattr(photo_upload_service, "_require_upload_access", lambda _user_id, _event_id: (_build_event(), "admin"))
    monkeypatch.setattr(
        photo_upload_service,
        "_get_event_photo_or_404",
        lambda _event_id, _photo_id: {"id": "photo-1", "event_id": "event-1", "cloudinary_id": "cloudinary-1"},
    )

    deleted_public_ids: list[list[str]] = []
    monkeypatch.setattr(
        photo_upload_service,
        "delete_event_photo_assets",
        lambda *, public_ids: deleted_public_ids.append(public_ids),
    )

    result = photo_upload_service.delete_event_photo(current_user, event_id="event-1", photo_id="photo-1")

    assert result == {"success": True}
    assert deleted_public_ids == [["cloudinary-1"]]
    assert client.calls == [
        ("user_photo_matches", {"photo_id": "photo-1"}),
        ("face_index", {"photo_id": "photo-1"}),
        ("photos", {"id": "photo-1", "event_id": "event-1"}),
    ]
