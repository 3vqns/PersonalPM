"""Asynchronous event photo upload orchestration."""

from __future__ import annotations

import logging
from io import BytesIO
from pathlib import Path
from typing import Iterable
from uuid import uuid4
from zipfile import BadZipFile, ZipFile

from fastapi import BackgroundTasks, UploadFile

from backend.config import getSettings
from backend.core.supabase_admin import get_supabase_admin_client
from backend.core.supabase_response import get_first_row
from backend.dependencies.auth import AuthenticatedUser
from backend.errors import AppError
from backend.schemas.event import EventRecord, EventRole
from backend.schemas.upload import StagedUploadFile, UploadJobStartResponse
from backend.services.cloudinary_service import delete_event_photo_assets, upload_event_photo
from backend.services.matching_service import trigger_event_member_rematch
from backend.services.rekognition_index_service import index_event_photo

logger = logging.getLogger("pictureme.uploads")
_ALLOWED_UPLOAD_TYPES = {"image/jpeg", "image/png", "image/webp"}
_ALLOWED_UPLOAD_EXTENSIONS = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
_ZIP_UPLOAD_TYPES = {"application/zip", "application/x-zip-compressed", "multipart/x-zip"}


async def start_event_upload_batch(
    current_user: AuthenticatedUser,
    *,
    event_id: str,
    files: list[UploadFile],
    background_tasks: BackgroundTasks,
) -> UploadJobStartResponse:
    """Validate an upload request, generate a batch id, and schedule async processing."""
    event, role = _require_upload_access(current_user.user_id, event_id)
    if event.status != "active":
        raise AppError("Expired events cannot accept new photo uploads", code="EVENT_EXPIRED", status=409)
    if len(files) > getSettings().max_event_upload_batch_files:
        raise AppError(
            "Too many photos were submitted in one batch",
            code="UPLOAD_BATCH_TOO_LARGE",
            status=422,
            details={"maxFiles": getSettings().max_event_upload_batch_files, "received": len(files)},
        )

    staged_files = await _stage_upload_files(event.id, files)
    if not staged_files:
        raise AppError("Select at least one photo to upload", code="VALIDATION_ERROR", status=422)

    job_id = f"upload-{uuid4().hex}"
    background_tasks.add_task(_process_upload_job, job_id, current_user.user_id, event, staged_files)
    logger.info(
        "Accepted upload batch",
        extra={"job_id": job_id, "event_id": event.id, "role": role, "file_count": len(staged_files)},
    )
    return UploadJobStartResponse(jobId=job_id)


async def _stage_upload_files(event_id: str, files: list[UploadFile]) -> list[StagedUploadFile]:
    settings = getSettings()
    staged_files: list[StagedUploadFile] = []
    seen_filenames = _existing_filename_keys(event_id)

    for upload in files:
        upload_filename = _clean_filename(upload.filename)
        content = await upload.read()

        if _is_zip_upload(upload_filename, upload.content_type):
            if len(content) > settings.max_event_upload_archive_size_bytes:
                raise AppError(
                    "One or more zip uploads exceed the archive size limit",
                    code="UPLOAD_TOO_LARGE",
                    status=422,
                    details={
                        "fileName": upload.filename,
                        "maxBytes": settings.max_event_upload_archive_size_bytes,
                        "receivedBytes": len(content),
                    },
                )
            staged_files.extend(_stage_zip_upload(upload_filename, content, seen_filenames))
        else:
            staged_files.append(
                _stage_image_file(
                    upload_filename,
                    upload.content_type,
                    content,
                    seen_filenames,
                )
            )

        if len(staged_files) > settings.max_event_upload_batch_files:
            raise AppError(
                "Too many photos were submitted in one batch",
                code="UPLOAD_BATCH_TOO_LARGE",
                status=422,
                details={"maxFiles": settings.max_event_upload_batch_files, "received": len(staged_files)},
            )

    return staged_files


def _process_upload_job(job_id: str, uploader_user_id: str, event: EventRecord, staged_files: list[StagedUploadFile]) -> None:
    indexed_files = 0
    failed_files = 0

    for staged_file in staged_files:
        completed = _process_one_file(
            job_id=job_id,
            uploader_user_id=uploader_user_id,
            event=event,
            staged_file=staged_file,
        )
        if completed:
            indexed_files += 1
        else:
            failed_files += 1

    logger.info(
        "Upload batch finished",
        extra={
            "job_id": job_id,
            "event_id": event.id,
            "indexed_files": indexed_files,
            "failed_files": failed_files,
        },
    )
    if indexed_files > 0:
        logger.info(
            "Upload batch finished and will trigger rematch",
            extra={"job_id": job_id, "event_id": event.id, "indexed_files": indexed_files},
        )
        trigger_event_member_rematch(event_id=event.id, reason="photo-upload-batch")


def _process_one_file(
    *,
    job_id: str,
    uploader_user_id: str,
    event: EventRecord,
    staged_file: StagedUploadFile,
) -> bool:
    logger.info(
        "Processing upload file",
        extra={"job_id": job_id, "event_id": event.id, "file_name": staged_file.file_name},
    )

    try:
        upload_result = upload_event_photo(event_id=event.id, file_name=staged_file.file_name, content=staged_file.content)
        upload_result["original_filename"] = staged_file.file_name
        photo_id = _insert_photo_row(event.id, uploader_user_id, upload_result)
        face_records = index_event_photo(collection_id=event.rekognition_collection_id, photo_id=photo_id, content=staged_file.content)
        _insert_face_index_rows(event.id, photo_id, face_records)
        logger.info(
            "Completed upload file",
            extra={
                "job_id": job_id,
                "event_id": event.id,
                "file_name": staged_file.file_name,
                "photo_id": photo_id,
                "face_count": len(face_records),
            },
        )
        return True
    except AppError as exc:
        logger.warning(
            "Upload file failed",
            extra={"job_id": job_id, "event_id": event.id, "file_name": staged_file.file_name, "code": exc.code},
        )
        return False
    except Exception as exc:
        logger.exception("Unexpected failure while processing upload job %s file %s", job_id, staged_file.file_name)
        return False


def _insert_photo_row(event_id: str, uploader_user_id: str, upload_result: dict) -> str:
    client = get_supabase_admin_client()
    payload = {
        "event_id": event_id,
        "uploaded_by": uploader_user_id,
        "original_filename": upload_result["original_filename"],
        "cloudinary_url": upload_result["cloudinary_url"],
        "cloudinary_id": upload_result["public_id"],
        "thumbnail_url": upload_result["thumbnail_url"],
        "face_count": 0,
    }
    try:
        response = client.table("photos").insert(payload).execute()
    except Exception as exc:
        if not _is_missing_original_filename_column(exc):
            raise AppError("PictureMe could not create the photo record", code="PHOTO_CREATE_FAILED", status=500) from exc

        fallback_payload = {key: value for key, value in payload.items() if key != "original_filename"}
        try:
            response = client.table("photos").insert(fallback_payload).execute()
        except Exception as retry_exc:
            raise AppError("PictureMe could not create the photo record", code="PHOTO_CREATE_FAILED", status=500) from retry_exc

    created_photo = get_first_row(response.data)
    photo_id = created_photo.get("id") if created_photo else None
    if not photo_id:
        raise AppError("PictureMe could not create the photo record", code="PHOTO_CREATE_FAILED", status=500)
    return str(photo_id)


def _insert_face_index_rows(event_id: str, photo_id: str, face_records: Iterable[dict]) -> None:
    rows = [
        {
            "photo_id": photo_id,
            "event_id": event_id,
            "rekognition_face_id": face_record["rekognition_face_id"],
            "bounding_box": face_record["bounding_box"],
        }
        for face_record in face_records
    ]

    if rows:
        try:
            get_supabase_admin_client().table("face_index").insert(rows).execute()
        except Exception as exc:
            raise AppError("PictureMe could not store indexed face rows", code="FACE_INDEX_CREATE_FAILED", status=500) from exc

    try:
        get_supabase_admin_client().table("photos").update({"face_count": len(rows)}).eq("id", photo_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not update the photo face count", code="PHOTO_UPDATE_FAILED", status=500) from exc


def _require_upload_access(user_id: str, event_id: str) -> tuple[EventRecord, EventRole]:
    try:
        response = get_supabase_admin_client().table("events").select(
            "id,creator_id,name,description,date,expires_at,join_token,rekognition_collection_id,cover_url,status,created_at"
        ).eq("id", event_id).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not load this event", code="EVENT_FETCH_FAILED", status=500) from exc

    if not response.data:
        raise AppError("Event not found", code="EVENT_NOT_FOUND", status=404)

    event = EventRecord.model_validate(response.data)
    if event.creator_id == user_id:
        return event, "creator"

    try:
        membership = get_supabase_admin_client().table("event_members").select("role").eq("event_id", event_id).eq(
            "user_id", user_id
        ).maybe_single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not verify upload access", code="EVENT_ACCESS_FAILED", status=500) from exc

    role = membership.data.get("role") if membership.data else None
    if role != "admin":
        raise AppError("Only event admins and creators can upload photos", code="FORBIDDEN", status=403)

    return event, "admin"


def delete_event_photo(current_user: AuthenticatedUser, *, event_id: str, photo_id: str) -> dict[str, bool]:
    """Delete one event photo and its dependent rows. Admins and creators may do this."""
    _require_upload_access(current_user.user_id, event_id)
    photo = _get_event_photo_or_404(event_id, photo_id)

    if photo.get("cloudinary_id"):
        delete_event_photo_assets(public_ids=[photo["cloudinary_id"]])

    client = get_supabase_admin_client()
    try:
        client.table("user_photo_matches").delete().eq("photo_id", photo_id).execute()
        client.table("face_index").delete().eq("photo_id", photo_id).execute()
        client.table("photos").delete().eq("id", photo_id).eq("event_id", event_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not delete this photo", code="PHOTO_DELETE_FAILED", status=500) from exc

    return {"success": True}


def _get_event_photo_or_404(event_id: str, photo_id: str) -> dict:
    client = get_supabase_admin_client()
    try:
        response = client.table("photos").select(
            "id,event_id,cloudinary_id,original_filename"
        ).eq("id", photo_id).eq("event_id", event_id).maybe_single().execute()
    except Exception as exc:
        if not _is_missing_original_filename_column(exc):
            raise AppError("PictureMe could not load this photo", code="PHOTO_FETCH_FAILED", status=500) from exc

        try:
            response = client.table("photos").select(
                "id,event_id,cloudinary_id"
            ).eq("id", photo_id).eq("event_id", event_id).maybe_single().execute()
        except Exception as retry_exc:
            raise AppError("PictureMe could not load this photo", code="PHOTO_FETCH_FAILED", status=500) from retry_exc

    if not response.data:
        raise AppError("Photo not found", code="PHOTO_NOT_FOUND", status=404)
    return response.data


def _existing_filename_keys(event_id: str) -> set[str]:
    client = get_supabase_admin_client()
    try:
        response = client.table("photos").select("original_filename").eq("event_id", event_id).execute()
    except Exception as exc:
        if not _is_missing_original_filename_column(exc):
            raise AppError("PictureMe could not verify duplicate filenames", code="PHOTO_FETCH_FAILED", status=500) from exc
        return set()

    return {
        _filename_key(row["original_filename"])
        for row in (response.data or [])
        if isinstance(row.get("original_filename"), str) and row["original_filename"].strip()
    }


def _stage_zip_upload(zip_filename: str, content: bytes, seen_filenames: set[str]) -> list[StagedUploadFile]:
    staged_files: list[StagedUploadFile] = []
    try:
        archive = ZipFile(BytesIO(content))
    except BadZipFile as exc:
        raise AppError(
            "Zip uploads must contain a valid archive",
            code="INVALID_UPLOAD",
            status=422,
            details={"fileName": zip_filename},
        ) from exc

    with archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue

            entry_name = _clean_filename(entry.filename)
            if not entry_name or entry_name.startswith("."):
                continue

            staged_files.append(
                _stage_image_file(
                    entry_name,
                    _content_type_for_filename(entry_name),
                    archive.read(entry),
                    seen_filenames,
                )
            )

    if not staged_files:
        raise AppError(
            "Zip uploads must contain at least one JPG, PNG, or WebP image",
            code="INVALID_UPLOAD_TYPE",
            status=422,
            details={"fileName": zip_filename},
        )

    return staged_files


def _stage_image_file(
    filename: str,
    content_type: str | None,
    content: bytes,
    seen_filenames: set[str],
) -> StagedUploadFile:
    settings = getSettings()
    if not filename:
        raise AppError("Each uploaded photo needs a filename", code="INVALID_UPLOAD", status=422)

    normalized_content_type = content_type or _content_type_for_filename(filename)
    if normalized_content_type not in _ALLOWED_UPLOAD_TYPES:
        raise AppError(
            "Event photo uploads must be JPEG, PNG, or WebP images",
            code="INVALID_UPLOAD_TYPE",
            status=422,
            details={"fileName": filename, "contentType": normalized_content_type or None},
        )

    byte_size = len(content)
    if byte_size == 0:
        raise AppError("Uploaded photos cannot be empty", code="INVALID_UPLOAD", status=422, details={"fileName": filename})
    if byte_size > settings.max_event_photo_size_bytes:
        raise AppError(
            "One or more files exceed the event photo size limit",
            code="UPLOAD_TOO_LARGE",
            status=422,
            details={"fileName": filename, "maxBytes": settings.max_event_photo_size_bytes, "receivedBytes": byte_size},
        )

    _ensure_unique_filename(filename, seen_filenames)
    return StagedUploadFile(
        file_name=filename,
        content_type=normalized_content_type,
        byte_size=byte_size,
        content=content,
    )


def _ensure_unique_filename(filename: str, seen_filenames: set[str]) -> None:
    normalized = _filename_key(filename)
    if normalized in seen_filenames:
        raise AppError(
            "Duplicate filenames are not allowed in the same event gallery",
            code="DUPLICATE_UPLOAD_FILENAME",
            status=409,
            details={"fileName": filename},
        )
    seen_filenames.add(normalized)


def _clean_filename(filename: str | None) -> str:
    normalized = Path((filename or "").replace("\\", "/")).name.strip()
    return normalized


def _filename_key(filename: str) -> str:
    return filename.strip().casefold()


def _content_type_for_filename(filename: str) -> str | None:
    return _ALLOWED_UPLOAD_EXTENSIONS.get(Path(filename).suffix.casefold())


def _is_zip_upload(filename: str, content_type: str | None) -> bool:
    return Path(filename).suffix.casefold() == ".zip" or (content_type or "").casefold() in _ZIP_UPLOAD_TYPES


def _is_missing_original_filename_column(exc: Exception) -> bool:
    message = str(exc).casefold()
    return "original_filename" in message and (
        "column" in message or "schema cache" in message or "pgrst" in message
    )
