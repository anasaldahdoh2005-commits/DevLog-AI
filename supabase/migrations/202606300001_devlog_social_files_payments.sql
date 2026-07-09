alter table if exists public.logs
  add column if not exists platform text not null default 'linkedin',
  add column if not exists image_urls text[] not null default '{}';

do $$
begin
  alter table public.logs
    add constraint logs_platform_check
    check (platform in ('linkedin', 'x', 'instagram'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.social_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('linkedin', 'x', 'instagram')),
  username text not null default '',
  profile_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

alter table public.social_profiles enable row level security;

drop policy if exists "Users can read own social profiles" on public.social_profiles;
create policy "Users can read own social profiles"
on public.social_profiles for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own social profiles" on public.social_profiles;
create policy "Users can insert own social profiles"
on public.social_profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own social profiles" on public.social_profiles;
create policy "Users can update own social profiles"
on public.social_profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('free', 'pro', 'team')),
  status text not null check (status in ('active', 'cancelled', 'expired', 'past_due')),
  payment_provider text not null default 'manual',
  payment_id text,
  start_date timestamptz not null default now(),
  end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read own subscriptions"
on public.subscriptions for select
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'log-images',
  'log-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own log images" on storage.objects;
create policy "Users can read own log images"
on storage.objects for select
using (
  bucket_id = 'log-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can upload own log images" on storage.objects;
create policy "Users can upload own log images"
on storage.objects for insert
with check (
  bucket_id = 'log-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can update own log images" on storage.objects;
create policy "Users can update own log images"
on storage.objects for update
using (
  bucket_id = 'log-images'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'log-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can delete own log images" on storage.objects;
create policy "Users can delete own log images"
on storage.objects for delete
using (
  bucket_id = 'log-images'
  and auth.uid()::text = (storage.foldername(name))[1]
);
