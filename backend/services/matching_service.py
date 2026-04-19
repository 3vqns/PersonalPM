"""Asynchronous face matching and rematch trigger orchestration."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import datetime, timezone

from botocore.exceptions import ClientError

from backend.config import getSettings
from backend.core.retry import run_with_retries
from backend.core.rekognition import get_rekognition_client
from backend.core.supabase_admin import get_supabase_admin_client
from backend.errors import AppError
from backend.schemas.account import FaceProfileImageRecord
from backend.schemas.event import EventMemberRecord, EventRecord

logger = logging.getLogger("pictureme.matching")
_MATCHABLE_SELFIE_TYPES = {"image/jpeg", "image/png"}


def trigger_user_event_match(*, user_id: str, event_id: str, reason: str) -> None:
    """Match one user's enrollment selfies against one event collection."""
    try:
        event = _get_active_event_or_none(event_id)
        if event is None:
            logger.info("Skipping match for user %s on event %s because the event is not active", user_id, event_id)
            return

        if not _user_has_event_access(user_id, event):
            logger.info("Skipping match for user %s on event %s because the user is not a member", user_id, event_id)
            return

        selfie_assets = _list_matchable_face_profile_images(user_id)
        if not selfie_assets:
            logger.info("Skipping match for user %s on event %s because no usable enrollment selfies were found", user_id, event_id)
            return

        best_photo_scores = _collect_best_photo_scores(event=event, selfie_assets=selfie_assets)
        _persist_user_photo_matches(user_id=user_id, event_id=event.id, best_photo_scores=best_photo_scores)
        logger.info(
            "Completed match run for user %s on event %s with %s matched photos (%s)",
            user_id,
            event.id,
            len(best_photo_scores),
            reason,
        )
    except Exception:
        logger.exception("Matching failed for user %s on event %s (%s)", user_id, event_id, reason)


def trigger_event_member_rematch(*, event_id: str, reason: str) -> None:
    """Run matching for all members of one event who have completed face profiles."""
    try:
        event = _get_active_event_or_none(event_id)
        if event is None:
            logger.info("Skipping event rematch for %s because the event is not active", event_id)
            return

        for member in _list_matchable_event_members(event_id):
            trigger_user_event_match(user_id=member.user_id, event_id=event.id, reason=reason)
    except Exception:
        logger.exception("Event rematch failed for event %s (%s)", event_id, reason)


def trigger_user_active_event_rematch(*, user_id: str, reason: str) -> None:
    """Run matching for all active events the user currently belongs to or created."""
    try:
        for event in _list_active_events_for_user(user_id):
            trigger_user_event_match(user_id=user_id, event_id=event.id, reason=reason)
    except Exception:
        logger.exception("Active-event rematch failed for user %s (%s)", user_id, reason)


def _collect_best_photo_scores(*, event: EventRecord, selfie_assets: list[FaceProfileImageRecord]) -> dict[str, float]:
    settings = getSettings()
    best_face_scores: dict[str, float] = {}

    for selfie_asset in selfie_assets:
        selfie_bytes = _download_face_profile_image(selfie_asset)
        face_matches = _search_faces_by_image(
            collection_id=event.rekognition_collection_id,
            image_bytes=selfie_bytes,
            face_match_threshold=settings.matching_similarity_threshold,
            max_faces=settings.matching_max_faces_per_selfie,
            storage_path=selfie_asset.storage_path,
        )
        for face_id, similarity in face_matches.items():
            current_best = best_face_scores.get(face_id)
            if current_best is None or similarity > current_best:
                best_face_scores[face_id] = similarity

    if not best_face_scores:
        return {}

    face_index_map = _map_face_ids_to_photo_ids(best_face_scores.keys(), event.id)
    best_photo_scores: dict[str, float] = {}
    for face_id, similarity in best_face_scores.items():
        photo_id = face_index_map.get(face_id)
        if not photo_id:
            continue
        current_best = best_photo_scores.get(photo_id)
        if current_best is None or similarity > current_best:
            best_photo_scores[photo_id] = similarity

    return best_photo_scores


def _persist_user_photo_matches(*, user_id: str, event_id: str, best_photo_scores: dict[str, float]) -> None:
    if not best_photo_scores:
        return

    client = get_supabase_admin_client()
    now = datetime.now(timezone.utc).isoformat()
    payload = [
        {
            "user_id": user_id,
            "photo_id": photo_id,
            "event_id": event_id,
            "similarity_score": similarity,
            "matched_at": now,
        }
        for photo_id, similarity in best_photo_scores.items()
    ]

    try:
        existing_response = client.table("user_photo_matches").select("id,photo_id,similarity_score").eq("user_id", user_id).eq(
            "event_id", event_id
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load existing user matches", code="MATCH_FETCH_FAILED", status=500) from exc

    existing_by_photo = {
        row["photo_id"]: row
        for row in (existing_response.data or [])
        if row.get("photo_id")
    }

    inserts: list[dict] = []
    updates: list[tuple[str, dict]] = []
    for row in payload:
        existing = existing_by_photo.get(row["photo_id"])
        if existing is None:
            inserts.append(row)
            continue

        existing_similarity = float(existing.get("similarity_score") or 0)
        if row["similarity_score"] > existing_similarity:
            updates.append(
                (
                    existing["id"],
                    {
                        "similarity_score": row["similarity_score"],
                        "matched_at": now,
                    },
                )
            )

    for row in inserts:
        try:
            client.table("user_photo_matches").insert(row).execute()
        except Exception:
            existing = _get_existing_match(user_id=user_id, event_id=event_id, photo_id=row["photo_id"])
            if existing is None:
                raise AppError("PictureMe could not insert new user photo matches", code="MATCH_WRITE_FAILED", status=500)

            existing_similarity = float(existing.get("similarity_score") or 0)
            if row["similarity_score"] > existing_similarity:
                updates.append(
                    (
                        existing["id"],
                        {
                            "similarity_score": row["similarity_score"],
                            "matched_at": now,
                        },
                    )
                )

    for row_id, update_payload in updates:
        try:
            client.table("user_photo_matches").update(update_payload).eq("id", row_id).execute()
        except Exception as exc:
            raise AppError("PictureMe could not update user photo matches", code="MATCH_WRITE_FAILED", status=500) from exc


def _download_face_profile_image(asset: FaceProfileImageRecord) -> bytes:
    try:
        return get_supabase_admin_client().storage.from_(asset.storage_bucket).download(asset.storage_path)
    except Exception as exc:
        raise AppError("PictureMe could not download an enrollment selfie", code="SELFIE_DOWNLOAD_FAILED", status=500) from exc


def _search_faces_by_image(
    *,
    collection_id: str,
    image_bytes: bytes,
    face_match_threshold: float,
    max_faces: int,
    storage_path: str,
) -> dict[str, float]:
    try:
        response = run_with_retries(
            operation_name="rekognition.search_faces_by_image",
            attempts=getSettings().external_retry_attempts,
            backoff_seconds=getSettings().external_retry_backoff_seconds,
            logger=logger,
            func=lambda: get_rekognition_client().search_faces_by_image(
                CollectionId=collection_id,
                Image={"Bytes": image_bytes},
                MaxFaces=max_faces,
                FaceMatchThreshold=face_match_threshold,
                QualityFilter="AUTO",
            ),
        )
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code == "InvalidParameterException":
            logger.warning("Skipping enrollment selfie %s for collection %s because no searchable face was detected", storage_path, collection_id)
            return {}
        raise AppError("PictureMe could not search faces by image", code="MATCH_SEARCH_FAILED", status=502) from exc
    except Exception as exc:
        raise AppError("PictureMe could not search faces by image", code="MATCH_SEARCH_FAILED", status=502) from exc

    matches: dict[str, float] = {}
    for match in response.get("FaceMatches", []):
        face = match.get("Face", {})
        face_id = face.get("FaceId")
        similarity = match.get("Similarity")
        if not face_id or similarity is None:
            continue
        current_best = matches.get(face_id)
        if current_best is None or similarity > current_best:
            matches[face_id] = float(similarity)
    return matches


def _map_face_ids_to_photo_ids(face_ids: Iterable[str], event_id: str) -> dict[str, str]:
    face_id_list = list(dict.fromkeys(face_ids))
    if not face_id_list:
        return {}

    try:
        response = get_supabase_admin_client().table("face_index").select("rekognition_face_id,photo_id").eq("event_id", event_id).in_(
            "rekognition_face_id", face_id_list
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not map indexed faces back to photos", code="FACE_INDEX_FETCH_FAILED", status=500) from exc

    return {
        row["rekognition_face_id"]: row["photo_id"]
        for row in (response.data or [])
        if row.get("rekognition_face_id") and row.get("photo_id")
    }


def _list_matchable_face_profile_images(user_id: str) -> list[FaceProfileImageRecord]:
    try:
        response = get_supabase_admin_client().table("face_profile_images").select(
            "id,user_id,storage_bucket,storage_path,content_type,byte_size,sort_order,created_at"
        ).eq("user_id", user_id).order("sort_order").execute()
    except Exception as exc:
        raise AppError("PictureMe could not load enrollment selfies", code="FACE_PROFILE_FETCH_FAILED", status=500) from exc

    rows = [FaceProfileImageRecord.model_validate(row) for row in (response.data or [])]
    supported_rows = [row for row in rows if row.content_type in _MATCHABLE_SELFIE_TYPES]
    skipped = len(rows) - len(supported_rows)
    if skipped:
        logger.warning("Skipping %s enrollment selfies for user %s because SearchFacesByImage only supports JPEG/PNG inputs", skipped, user_id)
    return supported_rows


def _list_matchable_event_members(event_id: str) -> list[EventMemberRecord]:
    try:
        members_response = get_supabase_admin_client().table("event_members").select("id,event_id,user_id,role,joined_at").eq(
            "event_id", event_id
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load event members for rematch", code="MEMBERS_FETCH_FAILED", status=500) from exc

    members = [EventMemberRecord.model_validate(row) for row in (members_response.data or [])]
    if not members:
        return []

    user_ids = [member.user_id for member in members]
    try:
        users_response = get_supabase_admin_client().table("users").select(
            "id,face_indexed_at,rekognition_face_id"
        ).in_("id", user_ids).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load event member face profile state", code="USER_FETCH_FAILED", status=500) from exc

    enabled_ids = {
        row["id"]
        for row in (users_response.data or [])
        if row.get("id") and (row.get("face_indexed_at") is not None or row.get("rekognition_face_id") is not None)
    }
    return [member for member in members if member.user_id in enabled_ids]


def _list_active_events_for_user(user_id: str) -> list[EventRecord]:
    try:
        created_response = get_supabase_admin_client().table("events").select(
            "id,creator_id,name,description,date,expires_at,join_token,rekognition_collection_id,cover_url,status,created_at"
        ).eq("creator_id", user_id).eq("status", "active").execute()
        membership_response = get_supabase_admin_client().table("event_members").select("event_id").eq("user_id", user_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not load active events for rematch", code="EVENT_FETCH_FAILED", status=500) from exc

    membership_ids = [row["event_id"] for row in (membership_response.data or []) if row.get("event_id")]
    member_events: list[EventRecord] = []
    if membership_ids:
        try:
            member_events_response = get_supabase_admin_client().table("events").select(
                "id,creator_id,name,description,date,expires_at,join_token,rekognition_collection_id,cover_url,status,created_at"
            ).in_("id", membership_ids).eq("status", "active").execute()
        except Exception as exc:
            raise AppError("PictureMe could not load member events for rematch", code="EVENT_FETCH_FAILED", status=500) from exc
        member_events = [EventRecord.model_validate(row) for row in (member_events_response.data or [])]

    created_events = [EventRecord.model_validate(row) for row in (created_response.data or [])]
    deduped: dict[str, EventRecord] = {event.id: event for event in created_events}
    for event in member_events:
        deduped[event.id] = event
    return list(deduped.values())


def _get_active_event_or_none(event_id: str) -> EventRecord | None:
    try:
        response = get_supabase_admin_client().table("events").select(
            "id,creator_id,name,description,date,expires_at,join_token,rekognition_collection_id,cover_url,status,created_at"
        ).eq("id", event_id).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not load an event for matching", code="EVENT_FETCH_FAILED", status=500) from exc

    if not response.data:
        return None

    event = EventRecord.model_validate(response.data)
    return event if event.status == "active" else None


def _user_has_event_access(user_id: str, event: EventRecord) -> bool:
    if event.creator_id == user_id:
        return True

    try:
        response = get_supabase_admin_client().table("event_members").select("id").eq("event_id", event.id).eq("user_id", user_id).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not verify event access for matching", code="EVENT_ACCESS_FAILED", status=500) from exc

    return bool(response.data)


def _get_existing_match(*, user_id: str, event_id: str, photo_id: str) -> dict | None:
    try:
        response = get_supabase_admin_client().table("user_photo_matches").select("id,similarity_score").eq("user_id", user_id).eq(
            "event_id", event_id
        ).eq("photo_id", photo_id).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not re-check an existing match", code="MATCH_FETCH_FAILED", status=500) from exc

    return response.data or None
