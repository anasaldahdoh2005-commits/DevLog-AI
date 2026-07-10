-- Reserve a daily generation slot and return its exact row id so failed
-- upstream calls can refund only their own slot.
create or replace function public.claim_daily_ai_generation_v2(max_daily integer default 3)
returns table(allowed boolean, used_count integer, limit_count integer, claim_id uuid)
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
  new_claim_id uuid;
begin
  if current_user_id is null then
    return query select false, 0, limit_value, null::uuid;
    return;
  end if;

  -- Serialize claims per user so concurrent taps cannot exceed the limit.
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
  if auth.uid() is null or target_claim_id is null then
    return false;
  end if;

  delete from public.ai_usage
  where id = target_claim_id
    and user_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.claim_daily_ai_generation_v2(integer) from public;
revoke all on function public.release_daily_ai_generation(uuid) from public;
grant execute on function public.claim_daily_ai_generation_v2(integer) to authenticated;
grant execute on function public.release_daily_ai_generation(uuid) to authenticated;

-- One-time repair: previous versions counted failed Gemini calls as usage.
-- Reset only the current UTC day so affected accounts can retry immediately.
delete from public.ai_usage
where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
