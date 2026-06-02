delete from public.user_photo_matches upm
using public.events e, public.event_gallery_access ega
where upm.event_id = e.id
  and upm.event_id = ega.event_id
  and upm.user_id = ega.user_id
  and e.private_gallery = true
  and ega.status = 'pending';

delete from public.event_members em
using public.events e, public.event_gallery_access ega
where em.event_id = e.id
  and em.event_id = ega.event_id
  and em.user_id = ega.user_id
  and e.private_gallery = true
  and ega.status = 'pending'
  and em.role = 'member'
  and em.user_id <> e.creator_id;
