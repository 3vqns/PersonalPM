"""Upload batch and per-file progress persistence helpers."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.core.supabase_admin import get_supabase_admin_client
from backend.core.supabase_response import get_first_row
from backend.errors import AppError
from backend.schemas.upload import (
    StagedUploadFile,
    UploadFileStatus,
    UploadJobFileRecord,
    UploadJobProgressResponse,
    UploadJobRecord,
    UploadJobStatus,
)


def create_upload_job(*, event_id: str, created_by: str, files: list[StagedUploadFile]) -> UploadJobRecord:
    """Create one upload batch plus queued file rows."""
    client = get_supabase_admin_client()
    now = _utc_now_iso()

    try:
        job_response = client.table("upload_jobs").insert(
            {
                "event_id": event_id,
                "created_by": created_by,
                "total_files": len(files),
                "uploaded_files": 0,
                "indexed_files": 0,
                "failed_files": 0,
                "status": "queued",
                "started_at": now,
            }
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not create the upload job", code="UPLOAD_JOB_CREATE_FAILED", status=500) from exc

    created_job = get_first_row(job_response.data)
    if not created_job:
        raise AppError("PictureMe could not create the upload job", code="UPLOAD_JOB_CREATE_FAILED", status=500)
    job = UploadJobRecord.model_validate(created_job)
    file_rows = [
        {
            "job_id": job.id,
            "event_id": event_id,
            "file_name": staged.file_name,
            "content_type": staged.content_type,
            "byte_size": staged.byte_size,
            "status": "queued",
        }
        for staged in files
    ]

    try:
        client.table("upload_job_files").insert(file_rows).execute()
    except Exception as exc:
        raise AppError("PictureMe could not create upload file rows", code="UPLOAD_JOB_CREATE_FAILED", status=500) from exc

    return job


def list_upload_job_files(job_id: str) -> list[UploadJobFileRecord]:
    """Return the queued file rows for one upload batch."""
    try:
        response = get_supabase_admin_client().table("upload_job_files").select("*").eq("job_id", job_id).order("created_at").execute()
    except Exception as exc:
        raise AppError("PictureMe could not load the upload job", code="UPLOAD_JOB_FETCH_FAILED", status=500) from exc

    return [UploadJobFileRecord.model_validate(row) for row in (response.data or [])]


def mark_job_running(*, job_id: str, status: UploadJobStatus, current_file_name: str | None = None) -> None:
    """Update batch-level running state."""
    _update_job(
        job_id,
        {
            "status": status,
            "current_file_name": current_file_name,
            "updated_at": _utc_now_iso(),
        },
    )


def mark_file_status(*, file_row_id: str, status: UploadFileStatus, current_error: str | None = None, extra: dict | None = None) -> None:
    """Update one per-file progress row."""
    payload = {
        "status": status,
        "updated_at": _utc_now_iso(),
        **(extra or {}),
    }
    if status in {"uploading", "indexing"}:
        payload["started_at"] = _utc_now_iso()
    if status in {"completed", "failed"}:
        payload["completed_at"] = _utc_now_iso()
    if current_error is not None:
        payload["error_message"] = current_error

    try:
        get_supabase_admin_client().table("upload_job_files").update(payload).eq("id", file_row_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not update upload file progress", code="UPLOAD_JOB_UPDATE_FAILED", status=500) from exc


def finalize_job(job_id: str) -> UploadJobProgressResponse:
    """Recompute and persist aggregate counters for a job."""
    file_rows = list_upload_job_files(job_id)
    uploaded_files = sum(1 for row in file_rows if row.status in {"uploaded", "indexing", "completed"})
    indexed_files = sum(1 for row in file_rows if row.status == "completed")
    failed_files = sum(1 for row in file_rows if row.status == "failed")
    total_files = len(file_rows)

    if total_files == 0:
        status: UploadJobStatus = "failed"
    elif indexed_files + failed_files >= total_files:
        status = "failed" if indexed_files == 0 and failed_files > 0 else "completed"
    elif uploaded_files > 0:
        status = "indexing"
    else:
        status = "queued"

    current_file_name = next((row.file_name for row in file_rows if row.status in {"uploading", "uploaded", "indexing"}), None)
    payload = {
        "uploaded_files": uploaded_files,
        "indexed_files": indexed_files,
        "failed_files": failed_files,
        "current_file_name": current_file_name,
        "status": status,
        "updated_at": _utc_now_iso(),
    }
    if status in {"completed", "failed"}:
        payload["completed_at"] = _utc_now_iso()

    try:
        response = get_supabase_admin_client().table("upload_jobs").update(payload).eq("id", job_id).select("*").single().execute()
    except Exception as exc:
        raise AppError("PictureMe could not finalize upload job progress", code="UPLOAD_JOB_UPDATE_FAILED", status=500) from exc

    job = UploadJobRecord.model_validate(response.data)
    return UploadJobProgressResponse(
        jobId=job.id,
        eventId=job.event_id,
        totalFiles=job.total_files,
        uploadedFiles=job.uploaded_files,
        indexedFiles=job.indexed_files,
        failedFiles=job.failed_files,
        currentFileName=job.current_file_name,
        status=job.status,
    )


def _update_job(job_id: str, payload: dict) -> None:
    try:
        get_supabase_admin_client().table("upload_jobs").update(payload).eq("id", job_id).execute()
    except Exception as exc:
        raise AppError("PictureMe could not update upload progress", code="UPLOAD_JOB_UPDATE_FAILED", status=500) from exc


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
