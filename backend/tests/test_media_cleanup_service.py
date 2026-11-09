"""Provider deletion statuses must control durable cleanup completion."""

from types import SimpleNamespace

import pytest

from backend.errors import AppError
from backend.services import media_cleanup_service


def test_cloudinary_cleanup_requires_per_asset_success(monkeypatch) -> None:
    monkeypatch.setattr(media_cleanup_service, "delete_event_photo_assets", lambda public_ids: {"other-id": "deleted"})
    assert media_cleanup_service._delete_queued_asset({"provider": "cloudinary", "asset_key": "asset-id"}) is False


def test_cloudinary_not_found_is_confirmed_cleanup(monkeypatch) -> None:
    monkeypatch.setattr(media_cleanup_service, "delete_event_photo_assets", lambda public_ids: {"asset-id": "not_found"})
    assert media_cleanup_service._delete_queued_asset({"provider": "cloudinary", "asset_key": "asset-id"}) is True


def test_storage_cleanup_requires_matching_path(monkeypatch) -> None:
    storageClient = SimpleNamespace(remove=lambda paths: [{"name": "different.jpg"}])
    adminClient = SimpleNamespace(storage=SimpleNamespace(from_=lambda bucket: storageClient))
    monkeypatch.setattr(media_cleanup_service, "get_supabase_admin_client", lambda: adminClient)
    assert media_cleanup_service._delete_queued_asset({
        "provider": "supabase_storage", "bucket": "face-profile-images", "asset_key": "user-1/selfie.jpg"
    }) is False


def test_event_photo_asset_pages_include_rows_after_first_page(monkeypatch) -> None:
    photoRows = [{"id": f"photo-{index}", "cloudinary_id": f"asset-{index}"} for index in range(5)]
    cursors: list[str | None] = []

    class PhotoQuery:
        def select(self, columns):
            assert columns == "id,cloudinary_id,cloudinary_url"
            return self

        def eq(self, column, value):
            assert (column, value) == ("event_id", "event-1")
            return self

        def order(self, column):
            assert column == "id"
            return self

        def limit(self, count):
            self.pageSize = count
            self.afterId = None
            return self

        def gt(self, column, value):
            assert column == "id"
            self.afterId = value
            return self

        def execute(self):
            cursors.append(self.afterId)
            remaining = [row for row in photoRows if self.afterId is None or row["id"] > self.afterId]
            return SimpleNamespace(data=remaining[:self.pageSize])

    adminClient = SimpleNamespace(table=lambda name: PhotoQuery())
    monkeypatch.setattr(media_cleanup_service, "get_supabase_admin_client", lambda: adminClient)

    pages = list(media_cleanup_service.iter_event_photo_asset_pages("event-1", pageSize=2))

    assert [row["cloudinary_id"] for page in pages for row in page] == [f"asset-{index}" for index in range(5)]
    assert cursors == [None, "photo-1", "photo-3"]


def test_requested_cleanup_requires_every_queued_reference(monkeypatch) -> None:
    class CleanupQuery:
        def select(self, columns):
            return self

        def order(self, column):
            return self

        def limit(self, count):
            return self

        def eq(self, column, value):
            return self

        def in_(self, column, values):
            return self

        def execute(self):
            return SimpleNamespace(data=[])

    adminClient = SimpleNamespace(table=lambda name: CleanupQuery())
    monkeypatch.setattr(media_cleanup_service, "get_supabase_admin_client", lambda: adminClient)

    assert media_cleanup_service.drain_media_cleanup(assetKeys=["missing-id"], provider="cloudinary") is False


def test_legacy_photo_url_keeps_deletion_reference(monkeypatch) -> None:
    monkeypatch.setattr(media_cleanup_service, "getSettings", lambda: SimpleNamespace(event_photo_folder="pictureme/events"))
    row = {
        "cloudinary_id": None,
        "cloudinary_url": "https://res.cloudinary.com/pictureme/image/upload/v123/pictureme/events/event-1/photo-1.jpg",
    }
    assert media_cleanup_service.event_photo_public_id(row, "event-1") == "pictureme/events/event-1/photo-1"


def test_unknown_legacy_photo_id_blocks_metadata_deletion(monkeypatch) -> None:
    monkeypatch.setattr(media_cleanup_service, "getSettings", lambda: SimpleNamespace(event_photo_folder="pictureme/events"))
    row = {"cloudinary_id": None, "cloudinary_url": "https://example.com/photo-1.jpg"}
    with pytest.raises(AppError) as excInfo:
        media_cleanup_service.event_photo_public_id(row, "event-1")
    assert excInfo.value.code == "MEDIA_ASSET_ID_UNKNOWN"
