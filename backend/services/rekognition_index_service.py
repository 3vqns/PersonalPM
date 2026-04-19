"""AWS Rekognition indexing helpers for event uploads."""

from __future__ import annotations

import logging

from backend.config import getSettings
from backend.core.retry import run_with_retries
from backend.core.rekognition import get_rekognition_client
from backend.errors import AppError

logger = logging.getLogger("pictureme.rekognition")


def index_event_photo(*, collection_id: str, photo_id: str, content: bytes) -> list[dict]:
    """Index all detectable faces for one uploaded event photo."""
    settings = getSettings()
    try:
        response = run_with_retries(
            operation_name="rekognition.index_faces",
            attempts=settings.external_retry_attempts,
            backoff_seconds=settings.external_retry_backoff_seconds,
            logger=logger,
            func=lambda: get_rekognition_client().index_faces(
                CollectionId=collection_id,
                Image={"Bytes": content},
                ExternalImageId=photo_id,
                DetectionAttributes=[],
                MaxFaces=100,
                QualityFilter="AUTO",
            ),
        )
    except Exception as exc:
        raise AppError("PictureMe could not index faces for an uploaded photo", code="REKOGNITION_INDEX_FAILED", status=502) from exc

    records: list[dict] = []
    for record in response.get("FaceRecords", []):
        face = record.get("Face", {})
        detail = record.get("FaceDetail", {})
        bounding_box = detail.get("BoundingBox") or face.get("BoundingBox") or {}
        face_id = face.get("FaceId")
        if not face_id:
            continue
        records.append(
            {
                "rekognition_face_id": face_id,
                "bounding_box": bounding_box,
            }
        )

    return records
