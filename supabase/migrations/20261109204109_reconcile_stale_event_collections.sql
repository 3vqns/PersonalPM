-- Release only an old reservation whose AWS collection was separately
-- confirmed absent by the backend. The advisory lock matches admission.
create or replace function public.list_stale_event_collection_reservations()
returns table(collection_id text) language sql security definer set search_path = public as $$
    select reservation.collection_id
    from public.event_collection_reservations reservation
    where reservation.created_at < now() - interval '15 minutes'
      and not exists (
          select 1 from public.events event
          where event.rekognition_collection_id = reservation.collection_id
      )
    order by reservation.created_at
    limit 10;
$$;
revoke all on function public.list_stale_event_collection_reservations() from public, anon, authenticated;
grant execute on function public.list_stale_event_collection_reservations() to service_role;

create or replace function public.release_stale_event_collection_reservation(collection_id_input text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    perform pg_advisory_xact_lock(476843, 20261105);
    delete from public.event_collection_reservations reservation
    where reservation.collection_id = collection_id_input
      and reservation.created_at < now() - interval '15 minutes'
      and not exists (
          select 1 from public.events event
          where event.rekognition_collection_id = reservation.collection_id
      );
    return found;
end;
$$;
revoke all on function public.release_stale_event_collection_reservation(text) from public, anon, authenticated;
grant execute on function public.release_stale_event_collection_reservation(text) to service_role;
