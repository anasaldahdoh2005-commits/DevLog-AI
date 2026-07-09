create extension if not exists pgcrypto;

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1200),
  generated_post text,
  post_style text not null default 'Professional',
  platform text not null default 'linkedin' check (platform in ('linkedin', 'x', 'instagram')),
  image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  username text not null default '' check (char_length(username) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists logs_user_created_idx
on public.logs (user_id, created_at desc);

create index if not exists ai_usage_user_created_idx
on public.ai_usage (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_logs_updated_at on public.logs;
create trigger set_logs_updated_at
before update on public.logs
for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_social_profiles_updated_at on public.social_profiles;
create trigger set_social_profiles_updated_at
before update on public.social_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

alter table public.logs enable row level security;
alter table public.profiles enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "Users can read own logs" on public.logs;
create policy "Users can read own logs"
on public.logs for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own logs" on public.logs;
create policy "Users can insert own logs"
on public.logs for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own logs" on public.logs;
create policy "Users can update own logs"
on public.logs for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own logs" on public.logs;
create policy "Users can delete own logs"
on public.logs for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can read own ai usage" on public.ai_usage;
create policy "Users can read own ai usage"
on public.ai_usage for select
using (auth.uid() = user_id);

create or replace function public.claim_daily_ai_generation(max_daily integer default 3)
returns table(allowed boolean, used_count integer, limit_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_count integer := 0;
  limit_value integer := greatest(coalesce(max_daily, 3), 1);
  day_start timestamptz;
  day_end timestamptz;
begin
  if current_user_id is null then
    return query select false, 0, limit_value;
    return;
  end if;

  day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  day_end := day_start + interval '1 day';

  select count(*)
    into current_count
  from public.ai_usage
  where user_id = current_user_id
    and created_at >= day_start
    and created_at < day_end;

  if current_count >= limit_value then
    return query select false, current_count, limit_value;
    return;
  end if;

  insert into public.ai_usage (user_id)
  values (current_user_id);

  return query select true, current_count + 1, limit_value;
end;
$$;

revoke all on function public.claim_daily_ai_generation(integer) from public;
grant execute on function public.claim_daily_ai_generation(integer) to authenticated;
