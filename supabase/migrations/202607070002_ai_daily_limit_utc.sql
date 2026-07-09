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