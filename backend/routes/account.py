"""Account and face-profile lifecycle routes."""

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile

from backend.dependencies.auth import AuthenticatedUser, require_authenticated_user
from backend.errors import AppError
from backend.schemas.account import AccountResponse, FaceProfileStatusResponse
from backend.services.account_service import delete_face_profile, get_account, replace_face_profile, update_account_profile

router = APIRouter(prefix="/api/account", tags=["account"])


@router.get("", response_model=AccountResponse)
async def get_current_account(
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> AccountResponse:
    """Return the backend-owned account record for the authenticated user."""
    return get_account(current_user)


@router.patch("/profile", response_model=AccountResponse)
async def patch_account_profile(
    name: str = Form(...),
    avatar: UploadFile | None = File(default=None),
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> AccountResponse:
    """Update editable profile fields while keeping media secrets backend-only."""
    if avatar is not None and avatar.filename:
        raise AppError(
            "Avatar uploads are not implemented yet",
            code="AVATAR_UPLOAD_NOT_IMPLEMENTED",
            status=501,
        )

    return update_account_profile(current_user, name=name)


@router.post("/face-profile", response_model=FaceProfileStatusResponse)
async def post_face_profile(
    background_tasks: BackgroundTasks,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
    selfies: list[UploadFile] | None = File(default=None),
    face: list[UploadFile] | None = File(default=None),
) -> FaceProfileStatusResponse:
    """Upload and replace the authenticated user's reusable enrollment selfies."""
    uploads = [*(selfies or []), *(face or [])]
    return await replace_face_profile(current_user, selfies=uploads, background_tasks=background_tasks)


@router.delete("/face-profile", response_model=FaceProfileStatusResponse)
async def remove_face_profile(
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
) -> FaceProfileStatusResponse:
    """Delete enrollment selfie assets and clear dependent match state."""
    return delete_face_profile(current_user)
