"""Authentication dependency behavior tests."""

from __future__ import annotations

from types import SimpleNamespace
from time import time
import pytest

from backend.dependencies import auth
from backend.errors import AppError

class FakeAuthApi:
    def __init__(self) -> None:
        self.call_count = 0

    def get_user(self, token: str):
        self.call_count += 1
        return SimpleNamespace(
            user={
                "id": "user-1",
                "email": "user@example.com",
                "user_metadata": {},
            },
        )


def test_auth_dependency_caches_token_validation(client, app, monkeypatch) -> None:
    fake_auth = FakeAuthApi()
    app.dependency_overrides.clear()
    monkeypatch.setattr("backend.dependencies.auth._token_expiry", lambda token: time() + 60)

    monkeypatch.setattr(
        "backend.dependencies.auth.get_supabase_client",
        lambda: SimpleNamespace(auth=fake_auth),
    )

    first_response = client.get(
        "/api/test/authenticated-user",
        headers={"Authorization": "Bearer test-token"},
    )
    second_response = client.get(
        "/api/test/authenticated-user",
        headers={"Authorization": "Bearer test-token"},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert fake_auth.call_count == 1


def test_expired_token_is_rejected_before_cached_result(monkeypatch) -> None:
    auth.clear_auth_user_cache()
    monkeypatch.setattr(auth, "_token_expiry", lambda token: time() - 1)
    auth._auth_user_cache["expired"] = (float("inf"), auth.AuthenticatedUser("user-1", None, "expired", {}))
    with pytest.raises(AppError) as excInfo:
        auth._get_cached_authenticated_user("expired")
    assert excInfo.value.code == "UNAUTHORIZED"
    auth.clear_auth_user_cache()


def test_validated_token_cache_evicts_at_low_limit(monkeypatch) -> None:
    auth.clear_auth_user_cache()
    monkeypatch.setattr(auth, "_token_expiry", lambda token: time() + 60)
    monkeypatch.setattr(auth, "getSettings", lambda: SimpleNamespace(auth_user_cache_ttl_seconds=60, authUserCacheMaxEntries=2))
    monkeypatch.setattr(auth, "_fetch_authenticated_user", lambda token: auth.AuthenticatedUser(token, None, token, {}))
    for token in ("first", "second", "third"):
        auth._get_cached_authenticated_user(token)
    assert list(auth._auth_user_cache) == ["second", "third"]
    auth.clear_auth_user_cache()
