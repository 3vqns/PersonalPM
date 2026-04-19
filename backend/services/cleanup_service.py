"""Internal expiry cleanup orchestration."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from botocore.exceptions import ClientError

from backend.core.rekognition import get_rekognition_client
from backend.core.supabase_admin import get_supabase_admin_client
from backend.errors import AppError
from backend.schemas.event import EventRecord
from backend.schemas.internal import CleanupEventResult, CleanupResponse
from backend.services.cloudinary_service import delete_event_photo_assets

logger = logging.getLogger("pictureme.cleanup")


def run_cleanup() -> CleanupResponse:
    """Find expired active events and clean external/media state safely."""
    events = _list_expired_active_events()
    results: list[CleanupEventResult] = []

    for event in events:
        results.append(_cleanup_one_event(event))

    return CleanupResponse(
        scannedEvents=len(events),
        cleanedEvents=sum(1 for result in results if result.status == "cleaned"),
        failedEvents=sum(1 for result in results if result.status == "failed"),
        skippedEvents=sum(1 for result in results if result.status == "skipped"),
        results=results,
    )


def _cleanup_one_event(event: EventRecord) -> CleanupEventResult:
    photo_rows = _list_event_photo_assets(event.id)
    public_ids = [row["cloudinary_id"] for row in photo_rows if row.get("cloudinary_id")]
    result = CleanupEventResult(
        eventId=event.id,
        status="skipped",
        photosConsidered=len(photo_rows),
        cloudinaryDeleted=0,
        cloudinaryFailed=0,
        userMatchesCleared=0,
        faceIndexCleared=0,
        errors=[],
    )

    if event.status == "expired":
        logger.info("Skipping cleanup for event %s because it is already expired", event.id)
        return result

    cloudinary_success = True
    if public_ids:
        try:
            deleted_map = delete_event_photo_assets(public_ids=public_ids)
            result.cloudinaryDeleted = sum(1 for public_id in public_ids if deleted_map.get(public_id) in {"deleted", "not_found"})
            result.cloudinaryFailed = len(public_ids) - result.cloudinaryDeleted
            cloudinary_success = result.cloudinaryFailed == 0
            if not cloudinary_success:
                result.errors.append("Some Cloudinary assets could not be deleted")
        except AppError as exc:
            result.cloudinaryFailed = len(public_ids)
            result.errors.append(exc.message)
            cloudinary_success = False

    rekognition_success = _delete_rekognition_collection_safe(event.rekognition_collection_id, result.errors)

    if not cloudinary_success or not rekognition_success:
        result.status = "failed"
        logger.warning(
            "Cleanup left event %s active due to external deletion failures",
            event.id,
            extra={
                "event_id": event.id,
                "cloudinary_failed": result.cloudinaryFailed,
                "errors": result.errors,
            },
        )
        return result

    try:
        result.userMatchesCleared = _delete_rows("user_photo_matches", event.id)
        result.faceIndexCleared = _delete_rows("face_index", event.id)
        _clear_photo_delivery_fields(event.id)
        _mark_event_expired(event.id)
        result.status = "cleaned"
        logger.info(
            "Expired event cleanup completed",
            extra={
                "event_id": event.id,
                "photos_considered": result.photosConsidered,
                "cloudinary_deleted": result.cloudinaryDeleted,
                "user_matches_cleared": result.userMatchesCleared,
                "face_index_cleared": result.faceIndexCleared,
            },
        )
    except AppError as exc:
        result.status = "failed"
        result.errors.append(exc.message)
        logger.warning(
            "Cleanup partially succeeded for event %s but database finalization failed",
            event.id,
            extra={"event_id": event.id, "errors": result.errors},
        )

    return result


def _list_expired_active_events() -> list[EventRecord]:
    now = datetime.now(timezone.utc).isoformat()
    try:
        response = get_supabase_admin_client().table("events").select(
            "id,creator_id,name,description,date,expires_at,join_token,rekognition_collection_id,cover_url,status,created_at"
        ).eq("status", "active").lt("expires_at", now).order("expires_at").execute()
    except Exception as exc:
        raise AppError("PictureMe could not load expired events for cleanup", code="CLEANUP_FETCH_FAILED", status=500) from exc

    return [EventRecord.model_validate(row) for row in (response.data or [])]


def _list_event_photo_assets(event_id: str) -> list[dict]:
    try:
        response = get_supabase_admin_client().table("photos").select("id,cloudinary_id").eq("event_id", event_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load event photos for cleanup", code="CLEANUP_FETCH_FAILED", status=500) from exc

    return response.data or []


def _delete_rekognition_collection_safe(collection_id: str, errors: list[str]) -> bool:
    try:
        get_rekognition_client().delete_collection(CollectionId=collection_id)
        return True
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code == "ResourceNotFoundException":
            return True
        errors.append("Rekognition collection deletion failed")
        return False
    except Exception:
        errors.append("Rekognition collection deletion failed")
        return False


def _delete_rows(table: str, event_id: str) -> int:
    try:
        count_response = get_supabase_admin_client().table(table).select("event_id").eq("event_id", event_id).execute()
        row_count = len(count_response.data or [])
        get_supabase_admin_client().table(table).delete().eq("event_id", event_id).execute()
    except Exception as exc:
        raise AppError(f"PictureMe could not clear {table} rows during cleanup", code="CLEANUP_DB_FAILED", status=500) from exc

    return row_count


def _clear_photo_delivery_fields(event_id: str) -> None:
    try:
        get_supabase_admin_client().table("photos").update(
            {
                "cloudinary_url": None,
                "cloudinary_id": None,
                "thumbnail_url": None,
            }
        ).eq("event_id", event_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not clear photo delivery metadata during cleanup", code="CLEANUP_DB_FAILED", status=500) from exc


def _mark_event_expired(event_id: str) -> None:
    try:
        get_supabase_admin_client().table("events").update({"status": "expired"}).eq("id", event_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not mark the event expired during cleanup", code="CLEANUP_DB_FAILED", status=500) from exc
