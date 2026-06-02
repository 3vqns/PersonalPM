-- Phase 7 event photo filename persistence and deduplication support.

alter table public.photos
  add column if not exists original_filename text null;

create unique index if not exists photos_event_original_filename_key
  on public.photos (event_id, lower(original_filename))
  where original_filename is not null;
