create table public.usage_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hour_started_at timestamptz not null default now(),
  hourly_requests integer not null default 0,
  minute_started_at timestamptz not null default now(),
  minute_requests integer not null default 0
);
--> statement-breakpoint
alter table public.usage_limits enable row level security;
--> statement-breakpoint
revoke all on public.usage_limits from anon, authenticated;
--> statement-breakpoint
create function public.consume_quatre_request_limit() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  hour_count integer;
  minute_count integer;
begin
  if current_user_id is null then return false; end if;
  insert into public.usage_limits (user_id, hour_started_at, hourly_requests, minute_started_at, minute_requests)
  values (current_user_id, now(), 1, now(), 1)
  on conflict (user_id) do update set
    hourly_requests = case when public.usage_limits.hour_started_at <= now() - interval '1 hour' then 1 else public.usage_limits.hourly_requests + 1 end,
    hour_started_at = case when public.usage_limits.hour_started_at <= now() - interval '1 hour' then now() else public.usage_limits.hour_started_at end,
    minute_requests = case when public.usage_limits.minute_started_at <= now() - interval '1 minute' then 1 else public.usage_limits.minute_requests + 1 end,
    minute_started_at = case when public.usage_limits.minute_started_at <= now() - interval '1 minute' then now() else public.usage_limits.minute_started_at end
  returning hourly_requests, minute_requests into hour_count, minute_count;
  return hour_count <= 20 and minute_count <= 5;
end;
$$;
--> statement-breakpoint
revoke all on function public.consume_quatre_request_limit() from public, anon;
--> statement-breakpoint
grant execute on function public.consume_quatre_request_limit() to authenticated;
