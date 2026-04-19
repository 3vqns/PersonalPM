-- Phase 2 account and face-profile lifecycle schema updates.
-- Run this after the base PictureMe schema exists.

alter table public.users
  add column if not exists face_indexed_at timestamptz null;

alter table public.users
  add column if not exists rekognition_face_id text null;

create table if not exists public.face_profile_images (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists face_profile_images_user_id_idx
  on public.face_profile_images (user_id, sort_order);

insert into storage.buckets (id, name, public)
values ('face-profile-images', 'face-profile-images', false)
on conflict (id) do nothing;

create index if not exists user_photo_matches_user_id_idx
  on public.user_photo_matches (user_id);
