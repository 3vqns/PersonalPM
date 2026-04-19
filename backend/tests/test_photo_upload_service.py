"""Upload orchestration guardrail tests."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from backend.dependencies.auth import AuthenticatedUser
from backend.errors import AppError
from backend.schemas.event import EventRecord
from backend.schemas.upload import StagedUploadFile, UploadJobRecord
from backend.services import photo_upload_service


class FakeBackgroundTasks:
    """Collect scheduled tasks without running them."""

    def __init__(self) -> None:
        self.tasks: list[tuple[object, tuple, dict]] = []

    def add_task(self, func, *args, **kwargs) -> None:
        self.tasks.append((func, args, kwargs))


def _build_upload_file(name: str) -> UploadFile:
    return UploadFile(filename=name, file=BytesIO(b"image-bytes"), headers=Headers({"content-type": "image/jpeg"}))


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
    async def _fake_stage_upload_files(_files):
        return [staged_file]

    monkeypatch.setattr(photo_upload_service, "_stage_upload_files", _fake_stage_upload_files)
    monkeypatch.setattr(
        photo_upload_service,
        "create_upload_job",
        lambda **_kwargs: UploadJobRecord(
            id="job-1",
            event_id=event.id,
            created_by=current_user.user_id,
            total_files=1,
            uploaded_files=0,
            indexed_files=0,
            failed_files=0,
            current_file_name=None,
            status="queued",
        ),
    )

    response = asyncio.run(
        photo_upload_service.start_event_upload_batch(
            current_user,
            event_id=event.id,
            files=[_build_upload_file("one.jpg")],
            background_tasks=background_tasks,
        )
    )

    assert response.job_id == "job-1"
    assert len(background_tasks.tasks) == 1
    queued_func, args, _kwargs = background_tasks.tasks[0]
    assert queued_func is photo_upload_service._process_upload_job
    assert args[0] == "job-1"
