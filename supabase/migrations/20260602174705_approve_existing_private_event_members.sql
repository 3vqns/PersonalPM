insert into public.event_gallery_access (
  event_id,
  user_id,
  status,
  invited_by,
  requested_at,
  approved_at
)
select
  em.event_id,
  em.user_id,
  'approved',
  e.creator_id,
  now(),
  now()
from public.event_members em
join public.events e on e.id = em.event_id
where e.private_gallery is true
  and em.user_id <> e.creator_id
  and em.role in ('member', 'admin')
on conflict (event_id, user_id)
do update set
  status = 'approved',
  invited_by = coalesce(public.event_gallery_access.invited_by, excluded.invited_by),
  approved_at = coalesce(public.event_gallery_access.approved_at, excluded.approved_at);
