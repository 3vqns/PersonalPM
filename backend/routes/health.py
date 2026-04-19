"""Health and deployment-friendly root endpoints."""

from fastapi import APIRouter, Response

router = APIRouter(tags=["health"])


@router.get("/")
async def root():
    """Return a lightweight root response for deployments and smoke tests."""
    return {"status": "ok", "service": "PictureMe API"}


@router.get("/api/health")
async def health_check():
    """Return a simple health status."""
    return {"status": "ok"}


@router.get("/favicon.ico", include_in_schema=False, status_code=204)
async def favicon() -> Response:
    """Avoid noisy 404s from browser favicon requests."""
    return Response(status_code=204)
