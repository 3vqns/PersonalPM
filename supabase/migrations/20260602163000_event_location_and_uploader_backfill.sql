-- Event location support and best-effort uploader attribution backfill.

alter table public.events
  add column if not exists location text not null default 'TBD';

update public.events
set location = 'TBD'
where location is null or btrim(location) = '';

update public.photos p
set uploader_name = u.name
from public.users u
where p.uploaded_by = u.id
  and (p.uploader_name is null or btrim(p.uploader_name) = '');

update public.photos p
set uploader_name = uj.uploader_name
from public.upload_job_files ujf
join public.upload_jobs uj on uj.id = ujf.job_id
where ujf.photo_id = p.id
  and p.uploaded_by is null
  and uj.uploader_name is not null
  and btrim(uj.uploader_name) <> ''
  and (p.uploader_name is null or btrim(p.uploader_name) = '');
