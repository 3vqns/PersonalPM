-- Phase 2 account and face-profile lifecycle schema updates.
-- Run this after the base PictureMe schema exists.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists face_profile_completed boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'face_indexed_at'
  ) then
    execute 'alter table public.users rename column face_indexed_at to face_profile_updated_at';
  end if;
end $$;

alter table public.users
  add column if not exists face_profile_updated_at timestamptz null;

alter table public.users
  drop column if exists rekognition_face_id;

create table if not exists public.face_profile_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null unique,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  sort_order integer not null check (sort_order between 1 and 5),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, sort_order)
);

create index if not exists face_profile_images_user_id_idx
  on public.face_profile_images (user_id, sort_order);

insert into storage.buckets (id, name, public)
values ('face-profile-images', 'face-profile-images', false)
on conflict (id) do nothing;

create index if not exists user_photo_matches_user_id_idx
  on public.user_photo_matches (user_id);
