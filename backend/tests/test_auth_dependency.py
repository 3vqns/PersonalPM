"""Authentication dependency behavior tests."""

from __future__ import annotations

from types import SimpleNamespace

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
