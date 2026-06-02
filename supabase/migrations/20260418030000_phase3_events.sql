-- Phase 3 event lifecycle and membership safety constraints.
-- Run this after the base PictureMe schema exists.

create extension if not exists pgcrypto;

create unique index if not exists events_join_token_key
  on public.events (join_token);

create unique index if not exists event_members_event_id_user_id_key
  on public.event_members (event_id, user_id);

create index if not exists event_members_user_id_idx
  on public.event_members (user_id);

create index if not exists photos_event_id_idx
  on public.photos (event_id);

create index if not exists events_creator_id_idx
  on public.events (creator_id);
