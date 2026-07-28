-- Harden AI quota refunds so only trusted Edge Functions can release a claim.
-- Keep the existing signatures for deployed frontend/function compatibility.
create or replace function public.claim_daily_ai_generation_v2(max_daily integer default 3)
returns table(allowed boolean, used_count integer, limit_count integer, claim_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_count integer := 0;
  limit_value constant integer := 3;
  day_start timestamptz;
  day_end timestamptz;
  new_claim_id uuid;
begin
  if current_user_id is null then
    return query select false, 0, limit_value, null::uuid;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  day_end := day_start + interval '1 day';

  select count(*)
    into current_count
  from public.ai_usage
  where user_id = current_user_id
    and created_at >= day_start
    and created_at < day_end;

  if current_count >= limit_value then
    return query select false, current_count, limit_value, null::uuid;
    return;
  end if;

  insert into public.ai_usage (user_id)
  values (current_user_id)
  returning id into new_claim_id;

  return query select true, current_count + 1, limit_value, new_claim_id;
end;
$$;

create or replace function public.release_daily_ai_generation(target_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     or target_claim_id is null then
    raise insufficient_privilege
      using message = 'Only the service role may release AI generation claims';
  end if;

  delete from public.ai_usage
  where id = target_claim_id;

  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.claim_daily_ai_generation(integer) from public, anon, authenticated;
revoke all on function public.claim_daily_ai_generation_v2(integer) from public, anon;
grant execute on function public.claim_daily_ai_generation_v2(integer) to authenticated;

revoke all on function public.release_daily_ai_generation(uuid) from public, anon, authenticated;
grant execute on function public.release_daily_ai_generation(uuid) to service_role;

-- Claim identifiers are an internal implementation detail.
drop policy if exists "Users can read own ai usage" on public.ai_usage;

-- Keep at most one pending LinkedIn OAuth state per app user. Starting a new
-- flow invalidates an older unfinished one for that same user.
delete from public.linkedin_oauth_states older
using public.linkedin_oauth_states newer
where older.user_id = newer.user_id
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.id < newer.id)
  );

do $$
begin
  alter table public.linkedin_oauth_states
    add constraint linkedin_oauth_states_user_id_key unique (user_id);
exception
  when duplicate_object then null;
end
$$;

-- Bound user-controlled columns even when clients call the Data API directly.
do $$
begin
  alter table public.logs
    add constraint logs_generated_post_length_check
    check (generated_post is null or char_length(generated_post) <= 10000)
    not valid;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.logs
    add constraint logs_image_count_check
    check (cardinality(image_urls) <= 8)
    not valid;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.social_profiles
    add constraint social_profiles_username_length_check
    check (char_length(username) <= 80)
    not valid;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.social_profiles
    add constraint social_profiles_url_length_check
    check (char_length(profile_url) <= 300)
    not valid;
exception
  when duplicate_object then null;
end
$$;
