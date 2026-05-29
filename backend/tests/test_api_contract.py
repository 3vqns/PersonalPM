"""Route-level contract tests for Phase 8 hardening."""

from __future__ import annotations

from backend.dependencies.auth import AuthenticatedUser, require_authenticated_user


def _fake_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        user_id="user-1",
        email="user@example.com",
        access_token="token",
        raw_user={"id": "user-1", "email": "user@example.com"},
    )


def test_validation_errors_keep_stable_json_shape(client, app) -> None:
    app.dependency_overrides[require_authenticated_user] = _fake_user

    response = client.patch("/api/events/event-1/members/user-2", json={"role": "owner"})

    assert response.status_code == 422
    assert response.headers["x-request-id"]
    assert response.json()["message"] == "Validation failed"
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert isinstance(response.json()["details"]["errors"], list)


def test_internal_cleanup_route_requires_secret(client) -> None:
    response = client.post("/api/cleanup")

    assert response.status_code == 403
    assert response.json() == {"message": "Missing authorization header", "code": "FORBIDDEN"}


def test_event_gallery_requires_authentication(client) -> None:
    response = client.get("/api/events/event-1/photos")

    assert response.status_code == 401
    assert response.json() == {"message": "Missing authorization header", "code": "UNAUTHORIZED"}
