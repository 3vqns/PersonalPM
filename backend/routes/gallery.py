"""Gallery read and public token sharing routes."""

from fastapi import APIRouter, Depends

from backend.dependencies.auth import AuthenticatedUser, require_authenticated_user
from backend.schemas.event import (
    AllPhotosResponse,
    GalleryResponse,
    GalleryTokenCreateRequest,
    MyPhotosResponse,
    ShareGalleryTokenResponse,
)
from backend.services.gallery_service import (
    create_or_reuse_gallery_token,
    get_event_photos,
    get_my_photos,
    get_shared_gallery,
)

router = APIRouter(tags=["gallery"])


@router.get("/api/events/{event_id}/photos", response_model=AllPhotosResponse)
async def get_gallery_photos(
    event_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> AllPhotosResponse:
    """Return the full gallery for an authorized event member."""
    return get_event_photos(current_user, event_id=event_id)


@router.get("/api/events/{event_id}/my-photos", response_model=MyPhotosResponse)
async def get_gallery_my_photos(
    event_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> MyPhotosResponse:
    """Return only the current user's matched photos for an authorized event."""
    return get_my_photos(current_user, event_id=event_id)


@router.post("/api/gallery-tokens", response_model=ShareGalleryTokenResponse)
async def post_gallery_token(
    payload: GalleryTokenCreateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> ShareGalleryTokenResponse:
    """Create or reuse a token scoped to the current user and one event."""
    return create_or_reuse_gallery_token(current_user, event_id=payload.event_id)


@router.get("/api/gallery/{token}", response_model=GalleryResponse)
async def get_public_gallery(
    token: str,
) -> GalleryResponse:
    """Return the token owner's matched-photo gallery only."""
    return get_shared_gallery(token)
