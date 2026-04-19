"""Supabase bearer-token validation dependency."""

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from backend.config import getSettings
from backend.core.supabase_client import create_supabase_server_client
from backend.errors import AppError

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(slots=True)
class AuthenticatedUser:
    """Normalized authenticated user context attached to each request."""

    user_id: str
    email: str | None
    access_token: str
    raw_user: dict[str, Any]

    def to_response(self) -> dict[str, Any]:
        """Return a safe response-friendly representation of the current user."""
        return {
            "userId": self.user_id,
            "email": self.email,
            "rawUser": self.raw_user,
        }


@lru_cache
def get_supabase_client() -> Client:
    """Return a cached Supabase admin client used for token verification."""
    settings = getSettings()
    return create_supabase_server_client(settings.supabase_url, settings.supabase_service_role_key_value)


def _serialize_user(user: Any) -> dict[str, Any]:
    """Normalize Supabase user objects into plain dictionaries."""
    if hasattr(user, "model_dump"):
        return user.model_dump()
    if hasattr(user, "dict"):
        return user.dict()
    if isinstance(user, dict):
        return user
    if hasattr(user, "__dict__"):
        return dict(user.__dict__)
    raise AppError("Unable to read authenticated user", code="AUTH_INVALID_USER", status=401)


async def require_authenticated_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthenticatedUser:
    """Validate a Supabase JWT and return user claims.

    Attaches userId, email, and raw claims to the request state.
    """
    if credentials is None:
        raise AppError("Missing authorization header", code="UNAUTHORIZED", status=401)

    token = credentials.credentials
    if not token:
        raise AppError("Invalid bearer token", code="UNAUTHORIZED", status=401)

    client = get_supabase_client()
    try:
        auth_response = client.auth.get_user(token)
    except Exception as exc:
        raise AppError("Invalid bearer token", code="UNAUTHORIZED", status=401) from exc

    user_payload = getattr(auth_response, "user", auth_response)
    raw_user = _serialize_user(user_payload)
    user_id = raw_user.get("id")

    if not user_id:
        raise AppError("Authenticated user is missing an id", code="AUTH_INVALID_USER", status=401)

    current_user = AuthenticatedUser(
        user_id=user_id,
        email=raw_user.get("email"),
        access_token=token,
        raw_user=raw_user,
    )
    request.state.current_user = current_user
    return current_user


async def get_optional_authenticated_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthenticatedUser | None:
    """Return the authenticated user when a bearer token is present."""
    if credentials is None:
        return None

    return await require_authenticated_user(request, credentials)
