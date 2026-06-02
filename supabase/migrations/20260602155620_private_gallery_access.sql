-- Private gallery access controls and photo uploader display metadata.

alter table public.events
  add column if not exists private_gallery boolean not null default false;

alter table public.photos
  add column if not exists uploader_name varchar(100);

create table if not exists public.event_gallery_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  invited_by uuid references public.users(id) on delete set null,
  unique (event_id, user_id)
);

create index if not exists event_gallery_access_event_id_idx
  on public.event_gallery_access(event_id);

create index if not exists event_gallery_access_user_id_idx
  on public.event_gallery_access(user_id);

alter table public.event_gallery_access enable row level security;

drop policy if exists "event_gallery_access: members can read same event" on public.event_gallery_access;
create policy "event_gallery_access: members can read same event"
on public.event_gallery_access
for select
to authenticated
using (
  exists (
    select 1
    from public.event_members em
    where em.event_id = event_gallery_access.event_id
      and em.user_id = (select auth.uid())
  )
);

drop policy if exists "event_gallery_access: users can request access" on public.event_gallery_access;
create policy "event_gallery_access: users can request access"
on public.event_gallery_access
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
);

drop policy if exists "event_gallery_access: creators can manage access" on public.event_gallery_access;
create policy "event_gallery_access: creators can manage access"
on public.event_gallery_access
for all
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
