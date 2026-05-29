"""Internal-only operational routes."""

from fastapi import APIRouter, Depends

from backend.dependencies.internal import require_internal_secret
from backend.schemas.internal import CleanupResponse
from backend.services.cleanup_service import run_cleanup

router = APIRouter(tags=["internal"])


@router.post("/api/cleanup", response_model=CleanupResponse, dependencies=[Depends(require_internal_secret)])
async def post_cleanup() -> CleanupResponse:
    """Run expiry cleanup for expired active events."""
    return run_cleanup()
