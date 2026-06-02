-- Phase 5 upload job tracking and photo upload support.
-- Run this after the base PictureMe schema exists.

create extension if not exists pgcrypto;

create table if not exists public.upload_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references public.users(id) on delete cascade,
  total_files integer not null check (total_files >= 0),
  uploaded_files integer not null default 0 check (uploaded_files >= 0),
  indexed_files integer not null default 0 check (indexed_files >= 0),
  failed_files integer not null default 0 check (failed_files >= 0),
  current_file_name text null,
  status text not null check (status in ('queued', 'uploading', 'indexing', 'completed', 'failed')),
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists upload_jobs_event_id_idx
  on public.upload_jobs (event_id);

create index if not exists upload_jobs_created_by_idx
  on public.upload_jobs (created_by);

create table if not exists public.upload_job_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.upload_jobs(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  status text not null check (status in ('queued', 'uploading', 'uploaded', 'indexing', 'completed', 'failed')),
  photo_id uuid null references public.photos(id) on delete set null,
  cloudinary_public_id text null,
  cloudinary_url text null,
  thumbnail_url text null,
  face_count integer not null default 0 check (face_count >= 0),
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists upload_job_files_job_id_idx
  on public.upload_job_files (job_id);

create index if not exists upload_job_files_event_id_idx
  on public.upload_job_files (event_id);

create index if not exists face_index_photo_id_idx
  on public.face_index (photo_id);
