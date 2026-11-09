"""Targeted account-service tests for profile and face-profile updates."""

from __future__ import annotations

import asyncio
from io import BytesIO
from types import SimpleNamespace
import pytest

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
        self.avatar_payloads: list[dict] = []

    def table(self, name: str):
        assert name == "users"
        return self.users

    def rpc(self, name: str, payload: dict):
        assert name == "update_account_avatar"
        self.avatar_payloads.append(payload)
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=None))


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
    monkeypatch.setattr(account_service, "get_public_user_record", lambda user: SimpleNamespace(avatar_url=None))
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
    assert client.avatar_payloads[0]["name_input"] == "Jordan Lee"
    assert client.avatar_payloads[0]["avatar_url_input"] == "https://cdn.example.com/avatar.jpg"


def test_upload_enrollment_selfie_persists_private_storage_path(monkeypatch) -> None:
    monkeypatch.setattr(
        account_service,
        "store_enrollment_selfie",
        lambda **_kwargs: "user-1/01-abc123.jpg",
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
        "storage_path": "user-1/01-abc123.jpg",
        "cloudinary_id": None,
        "cloudinary_url": None,
        "sort_order": 1,
    }


def test_upload_enrollment_selfie_surfaces_storage_errors(monkeypatch) -> None:
    def _fail_upload(**_kwargs):
        raise AppError("PictureMe could not store your enrollment selfie", code="SELFIE_UPLOAD_FAILED", status=502)

    monkeypatch.setattr(account_service, "store_enrollment_selfie", _fail_upload)
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


def test_enrollment_selfie_rejects_before_full_read(monkeypatch) -> None:
    monkeypatch.setattr(account_service, "getSettings", lambda: SimpleNamespace(max_face_profile_selfie_size_bytes=4))
    upload = UploadFile(filename="large.jpg", file=BytesIO(b"123456789"), headers=Headers({"content-type": "image/jpeg"}))
    with pytest.raises(AppError) as excInfo:
        asyncio.run(account_service._upload_enrollment_selfie("user-1", upload, 1))
    assert excInfo.value.code == "SELFIE_TOO_LARGE"
    assert upload.file.tell() == 5


def test_account_deletion_retains_photos_through_anonymization_rpc(monkeypatch) -> None:
    calls: list[tuple[str, object]] = []

    def recordRpc(name, payload):
        return SimpleNamespace(execute=lambda: _executeRpc(name, payload))

    def _executeRpc(name, payload):
        calls.append((name, payload))
        return SimpleNamespace(data=True if name == "check_account_deletion_transfers" else None)

    client = SimpleNamespace(
        rpc=recordRpc,
        auth=SimpleNamespace(admin=SimpleNamespace(delete_user=lambda userId: calls.append(("delete_auth", userId)))),
    )
    monkeypatch.setattr(account_service, "get_public_user_record", lambda user: SimpleNamespace(avatar_url=None))
    monkeypatch.setattr(account_service, "delete_face_profile", lambda user: None)
    monkeypatch.setattr(account_service, "getSettings", lambda: SimpleNamespace(account_avatar_folder="avatars"))
    monkeypatch.setattr(account_service, "get_supabase_admin_client", lambda: client)
    monkeypatch.setattr(account_service, "clear_auth_user_cache", lambda: None)

    account_service.delete_account(_fake_user())

    assert calls == [
        ("check_account_deletion_transfers", {"user_id_input": "user-1"}),
        ("prepare_account_deletion", {"user_id_input": "user-1"}),
        ("delete_auth", "user-1"),
    ]


def test_account_deletion_requires_active_admin_before_media_deletion(monkeypatch) -> None:
    client = SimpleNamespace(rpc=lambda name, payload: SimpleNamespace(execute=lambda: SimpleNamespace(data=False)))
    monkeypatch.setattr(account_service, "get_supabase_admin_client", lambda: client)
    monkeypatch.setattr(account_service, "get_public_user_record", lambda user: SimpleNamespace(avatar_url=None))
    monkeypatch.setattr(account_service, "delete_face_profile", lambda user: pytest.fail("media deletion started"))
    with pytest.raises(AppError) as excInfo:
        account_service.delete_account(_fake_user())
    assert excInfo.value.code == "ACCOUNT_EVENT_TRANSFER_UNAVAILABLE"
    assert excInfo.value.status == 409


def test_account_deletion_rechecks_successor_in_transfer_rpc(monkeypatch) -> None:
    def executeRpc(name, payload):
        if name == "prepare_account_deletion":
            raise RuntimeError("event has no active admin for transfer")
        return SimpleNamespace(data=True)

    client = SimpleNamespace(
        rpc=lambda name, payload: SimpleNamespace(execute=lambda: executeRpc(name, payload)),
        auth=SimpleNamespace(admin=SimpleNamespace(delete_user=lambda userId: pytest.fail("Auth deletion started"))),
    )
    monkeypatch.setattr(account_service, "get_supabase_admin_client", lambda: client)
    monkeypatch.setattr(account_service, "get_public_user_record", lambda user: SimpleNamespace(avatar_url=None))
    monkeypatch.setattr(account_service, "delete_face_profile", lambda user: None)
    monkeypatch.setattr(account_service, "getSettings", lambda: SimpleNamespace(account_avatar_folder="avatars"))

    with pytest.raises(AppError) as excInfo:
        account_service.delete_account(_fake_user())
    assert excInfo.value.code == "ACCOUNT_EVENT_TRANSFER_UNAVAILABLE"


def test_face_asset_cleanup_rejects_other_users_private_path() -> None:
    with pytest.raises(AppError) as excInfo:
        account_service._face_profile_asset_keys([{
            "user_id": "user-1", "storage_path": "user-2/selfie.jpg", "cloudinary_id": None,
        }])
    assert excInfo.value.code == "SELFIE_ASSET_ID_UNKNOWN"


def test_face_asset_cleanup_accepts_owned_private_path() -> None:
    assert account_service._face_profile_asset_keys([{
        "user_id": "user-1", "storage_path": "user-1/selfie.jpg", "cloudinary_id": None,
    }]) == ([], ["user-1/selfie.jpg"])
