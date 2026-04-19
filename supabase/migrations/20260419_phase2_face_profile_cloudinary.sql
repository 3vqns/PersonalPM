-- Add Cloudinary metadata for face-profile selfie assets while keeping legacy storage rows readable.

alter table public.face_profile_images
  add column if not exists cloudinary_id text null;

alter table public.face_profile_images
  add column if not exists cloudinary_url text null;

create index if not exists face_profile_images_cloudinary_id_idx
  on public.face_profile_images (cloudinary_id);
