"""Internal expiry cleanup orchestration."""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from botocore.exceptions import ClientError

from backend.config import getSettings
from backend.core.rekognition import get_rekognition_client
from backend.core.retry import run_with_retries
from backend.core.supabase_admin import get_supabase_admin_client
from backend.errors import AppError
from backend.schemas.event import EventRecord
from backend.schemas.internal import CleanupEventResult, CleanupResponse
from backend.services.cloudinary_service import cloudinary_public_id_from_url, delete_event_photo_assets
from backend.services.media_cleanup_service import drain_media_cleanup, event_photo_public_id, iter_event_photo_asset_pages, queue_media_cleanup

logger = logging.getLogger("pictureme.cleanup")


def run_cleanup() -> CleanupResponse:
    """Find expired active events and clean external/media state safely."""
    drain_media_cleanup(maxItems=100)
    _cleanup_orphaned_collections()
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
    _mark_cleanup_started(event.id)
    result = CleanupEventResult(
        eventId=event.id,
        status="skipped",
        photosConsidered=0,
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
    try:
        for photoRows in iter_event_photo_asset_pages(event.id):
            result.photos_considered += len(photoRows)
            publicIds = [publicId for row in photoRows if (publicId := event_photo_public_id(row, event.id))]
            if not publicIds:
                continue
            try:
                deletedMap = delete_event_photo_assets(public_ids=publicIds)
                deletedCount = sum(1 for publicId in publicIds if deletedMap.get(publicId) in {"deleted", "not_found"})
                result.cloudinary_deleted += deletedCount
                result.cloudinary_failed += len(publicIds) - deletedCount
            except AppError as exc:
                result.cloudinary_failed += len(publicIds)
                result.errors.append(exc.message)
    except AppError as exc:
        result.errors.append(exc.message)
        cloudinary_success = False
    if result.cloudinary_failed:
        result.errors.append("Some Cloudinary assets could not be deleted")
        cloudinary_success = False

    coverId = cloudinary_public_id_from_url(event.cover_url, f"{getSettings().event_cover_folder}/{event.id}")
    if event.cover_url and not coverId:
        result.errors.append("Event cover asset ID requires provider review")
        cloudinary_success = False
    if coverId:
        try:
            queue_media_cleanup(provider="cloudinary", assetKeys=[coverId])
            coverDeleted = drain_media_cleanup(assetKeys=[coverId], provider="cloudinary")
        except AppError:
            coverDeleted = False
        if not coverDeleted:
            result.errors.append("Event cover could not be deleted")
            cloudinary_success = False

    rekognition_success = _delete_rekognition_collection_safe(event.rekognition_collection_id, result.errors)
    if rekognition_success:
        _release_collection_reservation(event.rekognition_collection_id)

    if not cloudinary_success or not rekognition_success:
        result.status = "failed"
        logger.warning(
            "Cleanup left event %s active due to external deletion failures",
            event.id,
            extra={
                "event_id": event.id,
                "cloudinary_failed": result.cloudinary_failed,
                "errors": result.errors,
            },
        )
        return result

    try:
        result.user_matches_cleared = _delete_rows("user_photo_matches", event.id)
        result.face_index_cleared = _delete_rows("face_index", event.id)
        _clear_photo_delivery_fields(event.id)
        _mark_event_expired(event.id)
        result.status = "cleaned"
        logger.info(
            "Expired event cleanup completed",
            extra={
                "event_id": event.id,
                "photos_considered": result.photos_considered,
                "cloudinary_deleted": result.cloudinary_deleted,
                "user_matches_cleared": result.user_matches_cleared,
                "face_index_cleared": result.face_index_cleared,
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


def _mark_cleanup_started(eventId: str) -> None:
    try:
        get_supabase_admin_client().table("events").update({
            "delete_requested_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", eventId).execute()
    except Exception as exc:
        raise AppError("PictureMe could not close this event for uploads", code="CLEANUP_DB_FAILED", status=500) from exc


def _delete_rekognition_collection_safe(collection_id: str, errors: list[str]) -> bool:
    settings = getSettings()
    try:
        run_with_retries(
            operation_name="rekognition.delete_collection",
            attempts=settings.external_retry_attempts,
            backoff_seconds=settings.external_retry_backoff_seconds,
            logger=logger,
            func=lambda: get_rekognition_client().delete_collection(CollectionId=collection_id),
        )
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


def _release_collection_reservation(collectionId: str) -> None:
    try:
        get_supabase_admin_client().table("event_collection_reservations").delete().eq("collection_id", collectionId).execute()
    except Exception:
        logger.warning("Collection reservation still needs cleanup")


def _cleanup_orphaned_collections() -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    try:
        reservations = get_supabase_admin_client().table("event_collection_reservations").select("collection_id").lt(
            "created_at", cutoff
        ).limit(100).execute().data or []
    except Exception as exc:
        raise AppError("PictureMe could not load collection cleanup work", code="CLEANUP_FETCH_FAILED", status=500) from exc
    for row in reservations:
        collectionId = row["collection_id"]
        try:
            event = get_supabase_admin_client().table("events").select("id").eq(
                "rekognition_collection_id", collectionId
            ).limit(1).execute()
        except Exception:
            continue
        if event.data:
            continue
        errors: list[str] = []
        if _delete_rekognition_collection_safe(collectionId, errors):
            _release_collection_reservation(collectionId)


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
