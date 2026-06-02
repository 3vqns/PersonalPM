-- Phase 6 matching constraints and indexes.
-- Run this after the base PictureMe schema exists.

create unique index if not exists user_photo_matches_user_photo_key
  on public.user_photo_matches (user_id, photo_id);

create index if not exists user_photo_matches_event_photo_idx
  on public.user_photo_matches (event_id, photo_id);

create index if not exists face_index_event_face_id_idx
  on public.face_index (event_id, rekognition_face_id);
