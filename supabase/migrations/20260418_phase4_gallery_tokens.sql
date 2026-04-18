-- Phase 4 gallery token sharing indexes and constraints.
-- Run this after the base PictureMe schema exists.

create unique index if not exists gallery_tokens_user_event_key
  on public.gallery_tokens (user_id, event_id);

create index if not exists gallery_tokens_event_id_idx
  on public.gallery_tokens (event_id);

create index if not exists gallery_tokens_user_id_idx
  on public.gallery_tokens (user_id);

create index if not exists user_photo_matches_user_event_idx
  on public.user_photo_matches (user_id, event_id);
