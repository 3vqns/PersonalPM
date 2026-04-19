"""Targeted account-service tests for profile and face-profile updates."""

from __future__ import annotations

import asyncio
from io import BytesIO
from types import SimpleNamespace

from fastapi import UploadFile
from starlette.datastructures import Headers
from backend.dependencies.auth import AuthenticatedUser
from backend.errors import AppError
from backend.schemas.account import AccountResponse, AccountUserResponse
from backend.services import account_service


class _RecordingTable:
    def __init__(self) -> None:
        self.updated_payloads: list[dict] = []

    def update(self, payload):
        self.updated_payloads.append(payload)
        return self

    def eq(self, _key: str, _value: str):
        return self

    def execute(self):
        return SimpleNamespace(data={})


class _FakeClient:
    def __init__(self) -> None:
        self.users = _RecordingTable()

    def table(self, name: str):
        assert name == "users"
        return self.users


def _fake_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_id="user-1",
        email="user@example.com",
        access_token="token",
        raw_user={"id": "user-1", "email": "user@example.com"},
    )


def _build_upload_file(name: str) -> UploadFile:
    return UploadFile(filename=name, file=BytesIO(b"avatar-bytes"), headers=Headers({"content-type": "image/jpeg"}))


def test_update_account_profile_uploads_avatar_and_persists_url(monkeypatch) -> None:
    client = _FakeClient()
    current_user = _fake_user()

    monkeypatch.setattr(account_service, "get_supabase_admin_client", lambda: client)
    monkeypatch.setattr(
        account_service,
        "upload_account_avatar",
        lambda **_kwargs: asyncio.sleep(0, result="https://cdn.example.com/avatar.jpg"),
    )
    monkeypatch.setattr(
        account_service,
        "get_account",
        lambda _current_user: AccountResponse(
            user=AccountUserResponse(
                id=current_user.user_id,
                email=current_user.email or "",
                name="Jordan Lee",
                avatarUrl="https://cdn.example.com/avatar.jpg",
                hasFaceProfile=False,
                faceIndexedAt=None,
            )
        ),
    )

    response = asyncio.run(
        account_service.update_account_profile(
            current_user,
            name="Jordan Lee",
            avatar=_build_upload_file("avatar.jpg"),
        )
    )

    assert response.user.avatar_url == "https://cdn.example.com/avatar.jpg"
    assert client.users.updated_payloads == [
        {
            "name": "Jordan Lee",
            "avatar_url": "https://cdn.example.com/avatar.jpg",
        }
    ]


def test_upload_enrollment_selfie_persists_cloudinary_metadata(monkeypatch) -> None:
    monkeypatch.setattr(
        account_service,
        "upload_face_profile_selfie",
        lambda **_kwargs: asyncio.sleep(
            0,
            result={
                "public_id": "pictureme/face-profiles/user-1/01-abc123",
                "cloudinary_url": "https://res.cloudinary.com/demo/image/upload/v1/pictureme/face-profiles/user-1/01-abc123.jpg",
            },
        ),
    )
    monkeypatch.setattr(
        account_service,
        "getSettings",
        lambda: SimpleNamespace(max_face_profile_selfie_size_bytes=10 * 1024 * 1024),
    )

    upload = UploadFile(
        filename="selfie.jpg",
        file=BytesIO(b"selfie-bytes"),
        headers=Headers({"content-type": "image/jpeg"}),
    )

    result = asyncio.run(account_service._upload_enrollment_selfie("user-1", upload, 1))

    assert result == {
        "user_id": "user-1",
        "storage_path": "pictureme/face-profiles/user-1/01-abc123",
        "cloudinary_id": "pictureme/face-profiles/user-1/01-abc123",
        "cloudinary_url": "https://res.cloudinary.com/demo/image/upload/v1/pictureme/face-profiles/user-1/01-abc123.jpg",
        "sort_order": 1,
    }


def test_upload_enrollment_selfie_surfaces_cloudinary_errors(monkeypatch) -> None:
    async def _fail_upload(**_kwargs):
        raise AppError("PictureMe could not store your enrollment selfie", code="SELFIE_UPLOAD_FAILED", status=502)

    monkeypatch.setattr(account_service, "upload_face_profile_selfie", _fail_upload)
    monkeypatch.setattr(
        account_service,
        "getSettings",
        lambda: SimpleNamespace(max_face_profile_selfie_size_bytes=10 * 1024 * 1024),
    )

    upload = UploadFile(
        filename="selfie.jpg",
        file=BytesIO(b"selfie-bytes"),
        headers=Headers({"content-type": "image/jpeg"}),
    )

    try:
        asyncio.run(account_service._upload_enrollment_selfie("user-1", upload, 1))
        assert False, "expected AppError"
    except AppError as exc:
        assert exc.code == "SELFIE_UPLOAD_FAILED"
        assert exc.status == 502
