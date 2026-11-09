-- Apply before the backend that reads event_member_removals.
-- Product writes are backend-owned. Supabase's default table grants include
-- TRUNCATE and TRIGGER, which RLS does not protect. Restore only browser reads.
revoke all on public.users, public.face_profile_images,
    public.events, public.photos, public.face_index, public.user_photo_matches,
    public.event_gallery_access, public.event_members
from public, anon, authenticated;
grant select on public.users, public.face_profile_images,
    public.events, public.photos, public.face_index, public.user_photo_matches,
    public.event_gallery_access, public.event_members
to anon, authenticated;

create table if not exists public.event_member_removals (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    removed_by uuid not null,
    removed_at timestamptz not null default now(),
    unique (event_id, user_id)
);

alter table public.event_member_removals enable row level security;
revoke all on public.event_member_removals from anon, authenticated;
grant all on public.event_member_removals to service_role;

alter table public.events add column if not exists delete_requested_at timestamptz;

-- The event row and manager membership are locked in the same transaction as
-- the settings write, so a completed revocation cannot be followed by a write.
create or replace function public.update_event_as_manager(
    event_id_input uuid, actor_id_input uuid, patch jsonb, old_cover_id text, expected_cover_url text
) returns void language plpgsql security definer set search_path = public as $$
declare
    event_record public.events%rowtype;
    updated_record public.events%rowtype;
begin
    if patch is null or jsonb_typeof(patch) <> 'object' or exists (
        select 1 from jsonb_object_keys(patch) as field_name
        where field_name not in ('name', 'description', 'date', 'location', 'tags',
                                 'allow_anyone_upload', 'private_gallery', 'cover_url')
    ) then
        raise exception 'invalid event settings patch';
    end if;

    select * into event_record from public.events
    where id = event_id_input and delete_requested_at is null for update;
    if not found then
        raise exception 'event is unavailable';
    end if;
    if event_record.creator_id <> actor_id_input and not exists (
        select 1 from public.event_members
        where event_id = event_id_input and user_id = actor_id_input and role = 'admin'
        for share
    ) then
        raise exception 'event manager permission has been removed';
    end if;
    if patch ? 'cover_url' and event_record.cover_url is distinct from expected_cover_url then
        raise exception 'event cover changed during upload';
    end if;

    select * into updated_record from jsonb_populate_record(event_record, patch);
    update public.events set
        name = updated_record.name,
        description = updated_record.description,
        date = updated_record.date,
        location = updated_record.location,
        tags = updated_record.tags,
        allow_anyone_upload = updated_record.allow_anyone_upload,
        private_gallery = updated_record.private_gallery,
        cover_url = updated_record.cover_url
    where id = event_id_input;
    if old_cover_id is not null and patch ? 'cover_url' then
        insert into public.media_cleanup_queue (provider, asset_key)
        values ('cloudinary', old_cover_id)
        on conflict (provider, bucket, asset_key) do nothing;
    end if;
end;
$$;
revoke all on function public.update_event_as_manager(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.update_event_as_manager(uuid, uuid, jsonb, text, text) to service_role;

create or replace function public.request_event_deletion(event_id_input uuid, actor_id_input uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    update public.events set delete_requested_at = now()
    where id = event_id_input and creator_id = actor_id_input;
    if not found then
        raise exception 'event creator permission has been removed';
    end if;
end;
$$;
revoke all on function public.request_event_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_event_deletion(uuid, uuid) to service_role;

-- A join link is checked by the backend. A browser event ID is never authority.
drop policy if exists "event_members: self insert" on public.event_members;

create or replace function public.guard_removed_event_member()
returns trigger language plpgsql as $$
begin
    perform 1 from public.events
    where id = new.event_id and status = 'active' and delete_requested_at is null
    for share;
    if not found then
        raise exception 'event is unavailable for enrollment';
    end if;
    if exists (
        select 1 from public.event_member_removals removal
        where removal.event_id = new.event_id and removal.user_id = new.user_id
    ) then
        raise exception 'event access requires organizer restoration';
    end if;
    return new;
end;
$$;

drop trigger if exists guard_removed_event_member_insert on public.event_members;
create trigger guard_removed_event_member_insert
before insert on public.event_members
for each row execute function public.guard_removed_event_member();

-- All photo metadata writes pass through the backend's bounded upload path.
drop policy if exists "photos: admins can insert" on public.photos;
revoke insert on public.photos from public, anon, authenticated;

create or replace function public.guard_event_photo_insert()
returns trigger language plpgsql as $$
begin
    if not exists (
        select 1 from public.events event
        where event.id = new.event_id and event.status = 'active' and event.delete_requested_at is null
        and (
            (new.uploaded_by is null and event.allow_anyone_upload and nullif(btrim(new.uploader_name), '') is not null)
            or new.uploaded_by = event.creator_id
            or exists (
                select 1 from public.event_members member
                where member.event_id = new.event_id
                and member.user_id = new.uploaded_by and member.role = 'admin'
                for share
            )
        )
        for share
    ) then
        raise exception 'photo uploader no longer has event permission';
    end if;
    return new;
end;
$$;

drop trigger if exists guard_event_photo_insert on public.photos;
create trigger guard_event_photo_insert
before insert on public.photos
for each row execute function public.guard_event_photo_insert();

-- Enrollment selfies belong in a private bucket, never a public delivery folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('face-profile-images', 'face-profile-images', false, 10485760,
        array['image/jpeg', 'image/png']::text[])
on conflict (id) do update set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.media_cleanup_queue (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    bucket text not null default '',
    asset_key text not null,
    created_at timestamptz not null default now(),
    unique (provider, bucket, asset_key)
);

alter table public.media_cleanup_queue enable row level security;
revoke all on public.media_cleanup_queue from anon, authenticated;
grant all on public.media_cleanup_queue to service_role;

create or replace function public.update_account_avatar(
    user_id_input uuid,
    name_input text,
    avatar_url_input text,
    expected_avatar_url text,
    old_avatar_id text
) returns void language plpgsql security definer set search_path = public as $$
declare
    current_avatar_url text;
begin
    select avatar_url into current_avatar_url from public.users
    where id = user_id_input for update;
    if not found or current_avatar_url is distinct from expected_avatar_url then
        raise exception 'account avatar changed during upload';
    end if;
    update public.users set name = name_input, avatar_url = avatar_url_input
    where id = user_id_input;
    if old_avatar_id is not null then
        insert into public.media_cleanup_queue (provider, asset_key)
        values ('cloudinary', old_avatar_id)
        on conflict (provider, bucket, asset_key) do nothing;
    end if;
end;
$$;
revoke all on function public.update_account_avatar(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_account_avatar(uuid, text, text, text, text) to service_role;

-- The old references enter the retry queue in the same transaction that
-- replaces enrollment rows. A failed replacement leaves the old profile live.
create or replace function public.replace_face_profile_assets(
    user_id_input uuid,
    images jsonb,
    old_cloudinary_ids text[],
    old_storage_paths text[],
    indexed_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
    if images is null or jsonb_typeof(images) <> 'array' or jsonb_array_length(images) < 3
        or jsonb_array_length(images) > 5 then
        raise exception 'invalid enrollment image set';
    end if;
    perform 1 from public.users where id = user_id_input for update;
    if not found then
        raise exception 'account is unavailable';
    end if;

    delete from public.face_profile_images where user_id = user_id_input;
    insert into public.face_profile_images (user_id, storage_path, cloudinary_id, cloudinary_url, sort_order)
    select user_id_input, image.storage_path, image.cloudinary_id, image.cloudinary_url, image.sort_order
    from jsonb_to_recordset(images) as image(
        storage_path text, cloudinary_id text, cloudinary_url text, sort_order integer
    );
    update public.users set face_indexed_at = indexed_at where id = user_id_input;
    delete from public.user_photo_matches where user_id = user_id_input;

    insert into public.media_cleanup_queue (provider, asset_key)
    select 'cloudinary', asset_id from unnest(old_cloudinary_ids) as asset_id
    where asset_id <> '' on conflict (provider, bucket, asset_key) do nothing;
    insert into public.media_cleanup_queue (provider, bucket, asset_key)
    select 'supabase_storage', 'face-profile-images', asset_path
    from unnest(old_storage_paths) as asset_path
    where asset_path <> '' on conflict (provider, bucket, asset_key) do nothing;
end;
$$;
revoke all on function public.replace_face_profile_assets(uuid, jsonb, text[], text[], timestamptz) from public, anon, authenticated;
grant execute on function public.replace_face_profile_assets(uuid, jsonb, text[], text[], timestamptz) to service_role;

create table if not exists public.event_collection_reservations (
    collection_id text primary key,
    creator_id uuid not null,
    created_at timestamptz not null default now()
);

alter table public.event_collection_reservations enable row level security;
revoke all on public.event_collection_reservations from anon, authenticated;
grant all on public.event_collection_reservations to service_role;
insert into public.event_collection_reservations (collection_id, creator_id)
select rekognition_collection_id, creator_id from public.events
where rekognition_collection_id is not null
on conflict (collection_id) do nothing;

create or replace function public.reserve_event_collection(
    collection_id_input text, creator_id_input uuid, max_per_creator integer, max_total integer
) returns void language plpgsql security definer set search_path = public as $$
begin
    perform pg_advisory_xact_lock(476843, 20261105);
    if max_per_creator < 1 or max_total < 1
        or (select count(*) from public.event_collection_reservations where creator_id = creator_id_input) >= max_per_creator
        or (select count(*) from public.event_collection_reservations) >= max_total then
        raise exception 'event collection budget is full';
    end if;
    insert into public.event_collection_reservations (collection_id, creator_id)
    values (collection_id_input, creator_id_input);
end;
$$;
revoke all on function public.reserve_event_collection(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_event_collection(text, uuid, integer, integer) to service_role;

-- Account deletion keeps events and photos. The oldest active admin succeeds
-- the organizer; an event without one blocks deletion before media cleanup.
create or replace function public.check_account_deletion_transfers(user_id_input uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    if not exists (select 1 from public.users where id = user_id_input) then
        raise exception 'account is unavailable';
    end if;
    return not exists (
        select 1 from public.events event
        where event.creator_id = user_id_input and not exists (
            select 1 from public.event_members member
            join public.users candidate on candidate.id = member.user_id
            join auth.users authAccount on authAccount.id = candidate.id
            where member.event_id = event.id and member.role = 'admin'
              and member.user_id <> user_id_input
              and authAccount.deleted_at is null
              and (authAccount.banned_until is null or authAccount.banned_until <= now())
        )
    );
end;
$$;
revoke all on function public.check_account_deletion_transfers(uuid) from public, anon, authenticated;
grant execute on function public.check_account_deletion_transfers(uuid) to service_role;

create or replace function public.prepare_account_deletion(user_id_input uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
    eventRecord public.events%rowtype;
    successorId uuid;
begin
    perform 1 from public.users where id = user_id_input for update;
    if not found then
        raise exception 'account is unavailable';
    end if;

    for eventRecord in
        select * from public.events where creator_id = user_id_input order by id for update
    loop
        select member.user_id into successorId
        from public.event_members member
        join public.users candidate on candidate.id = member.user_id
        join auth.users authAccount on authAccount.id = candidate.id
        where member.event_id = eventRecord.id and member.role = 'admin'
          and member.user_id <> user_id_input
          and authAccount.deleted_at is null
          and (authAccount.banned_until is null or authAccount.banned_until <= now())
        order by member.joined_at nulls last, member.user_id
        limit 1 for share of member, candidate, authAccount;
        if successorId is null then
            raise exception 'event has no active admin for transfer';
        end if;

        delete from public.event_members
        where event_id = eventRecord.id and user_id = user_id_input;
        update public.event_members set role = 'creator'
        where event_id = eventRecord.id and user_id = successorId and role = 'admin';
        if not found then
            raise exception 'event has no active admin for transfer';
        end if;
        update public.events set creator_id = successorId where id = eventRecord.id;
        update public.event_collection_reservations set creator_id = successorId
        where collection_id = eventRecord.rekognition_collection_id;
    end loop;

    update public.photos set uploaded_by = null, uploader_name = 'Deleted user'
    where uploaded_by = user_id_input;
end;
$$;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
-- Service-role callers pass an actor ID, but the current organizer/manager
-- decision is made while the event row is locked in the write transaction.
create or replace function public.set_event_member_role_as_creator(
    event_id_input uuid, actor_id_input uuid, member_id_input uuid, role_input text
) returns void language plpgsql security definer set search_path = public as $$
declare
    creatorId uuid;
begin
    if role_input is null or role_input not in ('member', 'admin') then
        raise exception 'invalid event member role';
    end if;
    select creator_id into creatorId from public.events where id = event_id_input for update;
    if not found or creatorId <> actor_id_input or member_id_input = creatorId then
        raise exception 'event creator permission has been removed';
    end if;
    if role_input = 'admin' then
        update public.event_members set role = 'admin'
        where event_id = event_id_input and user_id = member_id_input;
    else
        update public.event_members set role = 'member'
        where event_id = event_id_input and user_id = member_id_input;
    end if;
    if not found then
        raise exception 'event member is unavailable';
    end if;
end;
$$;
revoke all on function public.set_event_member_role_as_creator(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_event_member_role_as_creator(uuid, uuid, uuid, text) to service_role;

create or replace function public.remove_event_member_as_manager(
    event_id_input uuid, actor_id_input uuid, member_id_input uuid, creator_only boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
    creatorId uuid;
    actorRole text;
    targetRole text;
begin
    select creator_id into creatorId from public.events where id = event_id_input for update;
    if not found then
        raise exception 'event is unavailable';
    end if;
    if member_id_input = creatorId or member_id_input = actor_id_input then
        raise exception 'event member removal is forbidden';
    end if;
    if actor_id_input <> creatorId then
        if creator_only is not false then
            raise exception 'event creator permission has been removed';
        end if;
        select role into actorRole from public.event_members
        where event_id = event_id_input and user_id = actor_id_input for share;
        if actorRole is distinct from 'admin' then
            raise exception 'event manager permission has been removed';
        end if;
    end if;

    select role into targetRole from public.event_members
    where event_id = event_id_input and user_id = member_id_input for update;
    if not found then
        raise exception 'event member is unavailable';
    end if;
    if targetRole = 'creator' then
        raise exception 'event member removal is forbidden';
    end if;
    if actor_id_input <> creatorId and targetRole = 'admin' then
        raise exception 'only the creator can remove an admin';
    end if;

    insert into public.event_member_removals (event_id, user_id, removed_by)
    values (event_id_input, member_id_input, actor_id_input)
    on conflict (event_id, user_id) do update set removed_by = excluded.removed_by, removed_at = now();
    delete from public.event_gallery_access where event_id = event_id_input and user_id = member_id_input;
    delete from public.user_photo_matches where event_id = event_id_input and user_id = member_id_input;
    delete from public.event_members where event_id = event_id_input and user_id = member_id_input;
end;
$$;
revoke all on function public.remove_event_member_as_manager(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.remove_event_member_as_manager(uuid, uuid, uuid, boolean) to service_role;

create or replace function public.set_gallery_access_as_creator(
    event_id_input uuid, actor_id_input uuid, member_id_input uuid, status_input text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    creatorId uuid;
    accessRecord public.event_gallery_access%rowtype;
begin
    if status_input is null or status_input not in ('approved', 'pending') then
        raise exception 'invalid gallery access status';
    end if;
    select creator_id into creatorId from public.events where id = event_id_input for update;
    if not found or creatorId <> actor_id_input or member_id_input = creatorId then
        raise exception 'event creator permission has been removed';
    end if;
    perform 1 from public.users where id = member_id_input for share;
    if not found then
        raise exception 'gallery access user is unavailable';
    end if;
    if exists (
        select 1 from public.event_members
        where event_id = event_id_input and user_id = member_id_input and role = 'creator'
    ) then
        raise exception 'event creator access cannot be changed';
    end if;

    if status_input = 'approved' then
        delete from public.event_member_removals where event_id = event_id_input and user_id = member_id_input;
        insert into public.event_members (event_id, user_id, role)
        values (event_id_input, member_id_input, 'member')
        on conflict (event_id, user_id) do nothing;
    elsif exists (
        select 1 from public.event_members where event_id = event_id_input and user_id = member_id_input
    ) then
        insert into public.event_member_removals (event_id, user_id, removed_by)
        values (event_id_input, member_id_input, actor_id_input)
        on conflict (event_id, user_id) do update set removed_by = excluded.removed_by, removed_at = now();
        delete from public.user_photo_matches where event_id = event_id_input and user_id = member_id_input;
        delete from public.event_members where event_id = event_id_input and user_id = member_id_input;
    end if;

    insert into public.event_gallery_access (event_id, user_id, status, invited_by, approved_at)
    values (event_id_input, member_id_input, status_input, actor_id_input,
            case when status_input = 'approved' then now() else null end)
    on conflict (event_id, user_id) do update set
        status = excluded.status,
        invited_by = excluded.invited_by,
        approved_at = excluded.approved_at
    returning * into accessRecord;
    return to_jsonb(accessRecord);
end;
$$;
revoke all on function public.set_gallery_access_as_creator(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_gallery_access_as_creator(uuid, uuid, uuid, text) to service_role;
create or replace function public.join_event_member_with_token(
    event_id_input uuid, user_id_input uuid, token_input text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
    insertedCount integer;
begin
    perform 1 from public.events
    where id = event_id_input and join_token = token_input
      and status = 'active' and delete_requested_at is null
    for update;
    if not found then
        raise exception 'join token is invalid or event is unavailable';
    end if;
    if exists (
        select 1 from public.event_member_removals
        where event_id = event_id_input and user_id = user_id_input
    ) then
        raise exception 'event access requires organizer restoration';
    end if;
    perform 1 from public.users where id = user_id_input for share;
    if not found then
        raise exception 'joining account is unavailable';
    end if;
    insert into public.event_members (event_id, user_id, role)
    values (event_id_input, user_id_input, 'member')
    on conflict (event_id, user_id) do nothing;
    get diagnostics insertedCount = row_count;
    return insertedCount > 0;
end;
$$;
revoke all on function public.join_event_member_with_token(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.join_event_member_with_token(uuid, uuid, text) to service_role;

-- Match writes must observe current enrollment and membership, including
-- when either is removed while Rekognition work is in flight.
create or replace function public.guard_user_photo_match_write()
returns trigger language plpgsql as $$
begin
    if not exists (
        select 1 from public.event_members member
        where member.event_id = new.event_id and member.user_id = new.user_id
        for share
    ) or not exists (
        select 1 from public.face_profile_images image
        where image.user_id = new.user_id
        for share
    ) then
        raise exception 'match subject is no longer enrolled in this event';
    end if;
    return new;
end;
$$;

drop trigger if exists guard_user_photo_match_insert on public.user_photo_matches;
create trigger guard_user_photo_match_insert
before insert on public.user_photo_matches
for each row execute function public.guard_user_photo_match_write();

create or replace function public.clear_matches_on_member_delete()
returns trigger language plpgsql as $$
begin
    delete from public.user_photo_matches
    where event_id = old.event_id and user_id = old.user_id;
    return old;
end;
$$;

drop trigger if exists clear_matches_on_member_delete on public.event_members;
create trigger clear_matches_on_member_delete
after delete on public.event_members
for each row execute function public.clear_matches_on_member_delete();

create or replace function public.clear_matches_on_last_face_delete()
returns trigger language plpgsql as $$
begin
    if not exists (select 1 from public.face_profile_images where user_id = old.user_id) then
        delete from public.user_photo_matches where user_id = old.user_id;
    end if;
    return old;
end;
$$;

drop trigger if exists clear_matches_on_last_face_delete on public.face_profile_images;
create trigger clear_matches_on_last_face_delete
after delete on public.face_profile_images
for each row execute function public.clear_matches_on_last_face_delete();
