-- Advisor fixes for private gallery access controls.

create index if not exists event_gallery_access_invited_by_idx
  on public.event_gallery_access(invited_by);

drop policy if exists "event_gallery_access: creators can manage access" on public.event_gallery_access;

drop policy if exists "event_gallery_access: creators can update access" on public.event_gallery_access;
create policy "event_gallery_access: creators can update access"
on public.event_gallery_access
for update
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_gallery_access.event_id
      and e.creator_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.events e
    where e.id = event_gallery_access.event_id
      and e.creator_id = (select auth.uid())
  )
);

drop policy if exists "event_gallery_access: creators can delete access" on public.event_gallery_access;
create policy "event_gallery_access: creators can delete access"
on public.event_gallery_access
for delete
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_gallery_access.event_id
      and e.creator_id = (select auth.uid())
  )
);
