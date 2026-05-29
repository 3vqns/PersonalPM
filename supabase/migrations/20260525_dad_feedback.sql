-- Dad feedback event fields and anonymous upload support.
-- Requires the existing events, photos, and upload_jobs tables.
-- If upload_jobs is missing in Supabase, run 20260418_phase5_upload_jobs.sql first.

alter table public.events
  add column if not exists tags text[] not null default '{}';

alter table public.events
  add column if not exists allow_anyone_upload boolean not null default false;

alter table public.events
  alter column expires_at drop not null;

alter table public.upload_jobs
  alter column created_by drop not null;

alter table public.upload_jobs
  add column if not exists uploader_name varchar(100);

alter table public.photos
  alter column uploaded_by drop not null;
