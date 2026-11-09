-- Trigger bodies qualify product tables explicitly. Pin builtin lookup to
-- pg_catalog so caller-controlled schemas cannot affect name resolution.
alter function public.guard_removed_event_member() set search_path = '';
alter function public.guard_event_photo_insert() set search_path = '';
alter function public.guard_user_photo_match_write() set search_path = '';
alter function public.clear_matches_on_member_delete() set search_path = '';
alter function public.clear_matches_on_last_face_delete() set search_path = '';
