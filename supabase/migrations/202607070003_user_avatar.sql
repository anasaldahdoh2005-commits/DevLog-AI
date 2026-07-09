alter table public.profiles
  add column if not exists avatar_path text not null default '' check (char_length(avatar_path) <= 500);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own avatars" on storage.objects;
create policy "Users can read own avatars"
on storage.objects for select
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can upload own avatars" on storage.objects;
create policy "Users can upload own avatars"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can update own avatars" on storage.objects;
create policy "Users can update own avatars"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can delete own avatars" on storage.objects;
create policy "Users can delete own avatars"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);
