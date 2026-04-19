"""Backend test fixtures and environment bootstrap."""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("INTERNAL_API_SECRET", "test-internal-secret")
os.environ.setdefault("CLOUDINARY_CLOUD_NAME", "pictureme")
os.environ.setdefault("CLOUDINARY_API_KEY", "test-cloudinary-key")
os.environ.setdefault("CLOUDINARY_API_SECRET", "test-cloudinary-secret")


@pytest.fixture(autouse=True)
def clear_cached_settings() -> Iterator[None]:
    """Reset cached singletons between tests so monkeypatching stays isolated."""
    from backend.config import getSettings
    from backend.core.cloudinary import configure_cloudinary
    from backend.core.rekognition import get_rekognition_client
    from backend.dependencies.auth import get_supabase_client

    getSettings.cache_clear()
    configure_cloudinary.cache_clear()
    get_rekognition_client.cache_clear()
    get_supabase_client.cache_clear()
    yield
    getSettings.cache_clear()
    configure_cloudinary.cache_clear()
    get_rekognition_client.cache_clear()
    get_supabase_client.cache_clear()


@pytest.fixture
def app():
    """Return the FastAPI app with a clean dependency override map."""
    from backend.main import app as fastapi_app

    fastapi_app.dependency_overrides.clear()
    return fastapi_app


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    """Return a synchronous test client for route assertions."""
    with TestClient(app) as test_client:
        yield test_client

