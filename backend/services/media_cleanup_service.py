"""Durable provider asset deletion with per-object confirmation."""

from collections.abc import Iterator

from backend.config import getSettings
from backend.core.supabase_admin import get_supabase_admin_client
from backend.errors import AppError
from backend.services.cloudinary_service import cloudinary_public_id_from_url, delete_event_photo_assets

_PHOTO_PAGE_SIZE = 500


def iter_event_photo_asset_pages(eventId: str, *, pageSize: int = _PHOTO_PAGE_SIZE) -> Iterator[list[dict]]:
    """Read every photo reference while event deletion keeps rows in place."""
    if pageSize < 1 or pageSize > _PHOTO_PAGE_SIZE:
        raise ValueError("photo page size must be between 1 and 500")
    lastId: str | None = None
    while True:
        try:
            query = get_supabase_admin_client().table("photos").select("id,cloudinary_id,cloudinary_url").eq(
                "event_id", eventId
            ).order("id").limit(pageSize)
            if lastId is not None:
                query = query.gt("id", lastId)
            response = query.execute()
        except Exception as exc:
            raise AppError("PictureMe could not load event media references", code="MEDIA_CLEANUP_FETCH_FAILED", status=500) from exc
        rows = response.data or []
        if not rows:
            return
        yield rows
        if len(rows) < pageSize:
            return
        lastId = rows[-1]["id"]


def event_photo_public_id(row: dict, eventId: str) -> str | None:
    """Keep legacy delivery URLs from losing their provider deletion reference."""
    expectedPrefix = f"{getSettings().event_photo_folder.rstrip('/')}/{eventId}"
    publicId = row.get("cloudinary_id")
    if publicId:
        if publicId.startswith(expectedPrefix + "/"):
            return publicId
        raise AppError("Photo media ID requires provider review", code="MEDIA_ASSET_ID_UNKNOWN", status=409)
    url = row.get("cloudinary_url")
    if not url:
        return None
    inferredId = cloudinary_public_id_from_url(url, expectedPrefix)
    if inferredId is None:
        raise AppError("Photo media ID requires provider review", code="MEDIA_ASSET_ID_UNKNOWN", status=409)
    return inferredId


def queue_media_cleanup(*, provider: str, assetKeys: list[str], bucket: str = "") -> None:
    uniqueKeys = list(dict.fromkeys(key for key in assetKeys if key))
    if not uniqueKeys:
        return
    rows = [{"provider": provider, "bucket": bucket, "asset_key": key} for key in uniqueKeys]
    try:
        get_supabase_admin_client().table("media_cleanup_queue").upsert(
            rows, on_conflict="provider,bucket,asset_key"
        ).execute()
    except Exception as exc:
        raise AppError("PictureMe could not retain media cleanup references", code="MEDIA_CLEANUP_QUEUE_FAILED", status=500) from exc


def drain_media_cleanup(*, assetKeys: list[str] | None = None, maxItems: int = 100, provider: str | None = None, bucket: str | None = None) -> bool:
    """Delete a bounded queue page; retain every unconfirmed asset for retry."""
    if assetKeys is not None and len(assetKeys) > maxItems:
        return all(
            drain_media_cleanup(assetKeys=assetKeys[index:index + maxItems], maxItems=maxItems, provider=provider, bucket=bucket)
            for index in range(0, len(assetKeys), maxItems)
        )
    client = get_supabase_admin_client()
    query = client.table("media_cleanup_queue").select("id,provider,bucket,asset_key").order("created_at").limit(maxItems)
    if provider is not None:
        query = query.eq("provider", provider)
    if bucket is not None:
        query = query.eq("bucket", bucket)
    if assetKeys is not None:
        if not assetKeys:
            return True
        query = query.in_("asset_key", assetKeys)
    try:
        rows = query.execute().data or []
    except Exception as exc:
        raise AppError("PictureMe could not load media cleanup work", code="MEDIA_CLEANUP_FETCH_FAILED", status=500) from exc

    allDeleted = assetKeys is None or set(assetKeys).issubset({row["asset_key"] for row in rows})
    for row in rows:
        try:
            deleted = _delete_queued_asset(row)
        except Exception:
            deleted = False
        if not deleted:
            allDeleted = False
            continue
        try:
            client.table("media_cleanup_queue").delete().eq("id", row["id"]).execute()
        except Exception:
            allDeleted = False
    return allDeleted


def _delete_queued_asset(row: dict) -> bool:
    assetKey = row["asset_key"]
    if row["provider"] == "cloudinary":
        result = delete_event_photo_assets(public_ids=[assetKey])
        return result.get(assetKey) in {"deleted", "not_found"}
    if row["provider"] == "supabase_storage":
        result = get_supabase_admin_client().storage.from_(row["bucket"] or getSettings().face_profile_bucket).remove([assetKey])
        if not isinstance(result, list):
            return False
        return any(item.get("name") == assetKey or item.get("name") == assetKey.rsplit("/", 1)[-1] for item in result if isinstance(item, dict))
    return False
