alter table public.profiles
  add column notify_community boolean not null default true,
  add column notify_messages boolean not null default true,
  add column notify_product boolean not null default true;
--> statement-breakpoint
grant update (notify_community, notify_messages, notify_product) on public.profiles to authenticated;
--> statement-breakpoint

create type public.quatre_notification_type as enum (
  'connection_request', 'connection_accepted', 'message_request', 'new_message',
  'profile_interaction', 'community', 'system', 'usage', 'product', 'security'
);
--> statement-breakpoint

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type public.quatre_notification_type not null,
  title text not null check (length(title) between 1 and 100),
  body text not null check (length(body) between 1 and 300),
  href text,
  source_type text,
  source_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (href is null or (left(href, 1) = '/' and left(href, 2) <> '//'))
);
--> statement-breakpoint
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
--> statement-breakpoint
create index notifications_recipient_unread_idx on public.notifications (recipient_id, created_at desc) where read_at is null;
--> statement-breakpoint
create unique index notifications_source_unique on public.notifications (recipient_id, type, source_type, source_id) where source_id is not null;
--> statement-breakpoint
alter table public.notifications enable row level security;
--> statement-breakpoint
revoke all on public.notifications from anon, authenticated;
--> statement-breakpoint
grant select, delete on public.notifications to authenticated;
--> statement-breakpoint
grant update (read_at) on public.notifications to authenticated;
--> statement-breakpoint
create policy "Users read their notifications" on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
--> statement-breakpoint
create policy "Users mark their notifications read or unread" on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
--> statement-breakpoint
create policy "Users dismiss their notifications" on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());
--> statement-breakpoint

create function public.enqueue_quatre_notification(
  target_user_id uuid,
  actor_user_id uuid,
  notification_kind public.quatre_notification_type,
  notification_title text,
  notification_body text,
  action_href text,
  event_source_type text,
  event_source_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  enabled boolean;
begin
  if target_user_id is null or target_user_id = actor_user_id then return; end if;
  if actor_user_id is not null and (
    exists (select 1 from public.profile_blocks b where
      (b.blocker_id = target_user_id and b.blocked_id = actor_user_id)
      or (b.blocker_id = actor_user_id and b.blocked_id = target_user_id))
    or exists (select 1 from public.profile_mutes m where m.muter_id = target_user_id and m.muted_id = actor_user_id)
  ) then return; end if;

  select case
    when notification_kind in ('connection_request', 'connection_accepted', 'profile_interaction', 'community') then p.notify_community
    when notification_kind in ('message_request', 'new_message') then p.notify_messages
    when notification_kind = 'product' then p.notify_product
    else true
  end into enabled from public.profiles p where p.id = target_user_id;
  if not coalesce(enabled, false) then return; end if;

  insert into public.notifications (recipient_id, actor_id, type, title, body, href, source_type, source_id)
  values (target_user_id, actor_user_id, notification_kind, notification_title, notification_body,
    action_href, event_source_type, event_source_id)
  on conflict (recipient_id, type, source_type, source_id) where source_id is not null do nothing;
end;
$$;
--> statement-breakpoint
revoke all on function public.enqueue_quatre_notification(uuid, uuid, public.quatre_notification_type, text, text, text, text, uuid) from public, anon, authenticated;
--> statement-breakpoint

create function public.notify_quatre_connection_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  actor uuid;
  actor_name text;
  notification_kind public.quatre_notification_type;
  notification_title text;
  notification_body text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    recipient := new.recipient_id;
    actor := new.requester_id;
    notification_kind := 'connection_request';
    notification_title := 'Connection request';
    select coalesce(nullif(p.display_name, ''), 'Someone') into actor_name from public.profiles p where p.id = actor;
    notification_body := actor_name || ' sent you a connection request.';
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    recipient := new.requester_id;
    actor := new.recipient_id;
    notification_kind := 'connection_accepted';
    notification_title := 'You’re connected';
    select coalesce(nullif(p.display_name, ''), 'Someone') into actor_name from public.profiles p where p.id = actor;
    notification_body := actor_name || ' accepted your connection request.';
  else
    return new;
  end if;

  perform public.enqueue_quatre_notification(recipient, actor, notification_kind, notification_title,
    notification_body, '/community', 'connection', new.id);
  return new;
end;
$$;
--> statement-breakpoint
revoke all on function public.notify_quatre_connection_event() from public, anon, authenticated;
--> statement-breakpoint
create trigger quatre_connection_notifications after insert or update on public.connections
  for each row execute function public.notify_quatre_connection_event();
--> statement-breakpoint

create function public.notify_quatre_message_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor_name text;
begin
  select coalesce(nullif(p.display_name, ''), 'Someone') into actor_name
  from public.profiles p where p.id = new.requester_id;
  perform public.enqueue_quatre_notification(new.recipient_id, new.requester_id, 'message_request',
    'Message request', actor_name || ' sent you a message request.', '/community', 'message_request', new.id);
  return new;
end;
$$;
--> statement-breakpoint
revoke all on function public.notify_quatre_message_request() from public, anon, authenticated;
--> statement-breakpoint
create trigger quatre_message_request_notifications after insert on public.community_threads
  for each row when (new.status = 'pending') execute function public.notify_quatre_message_request();
--> statement-breakpoint

create function public.notify_quatre_new_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  actor_name text;
begin
  select case when t.requester_id = new.sender_id then t.recipient_id else t.requester_id end
    into recipient
  from public.community_threads t where t.id = new.thread_id and t.status = 'accepted'
    and (t.requester_id = new.sender_id or t.recipient_id = new.sender_id);
  if recipient is null then return new; end if;
  select coalesce(nullif(p.display_name, ''), 'Someone') into actor_name
    from public.profiles p where p.id = new.sender_id;
  perform public.enqueue_quatre_notification(recipient, new.sender_id, 'new_message',
    'New message', actor_name || ' sent you a message.', '/community', 'message', new.id);
  return new;
end;
$$;
--> statement-breakpoint
revoke all on function public.notify_quatre_new_message() from public, anon, authenticated;
--> statement-breakpoint
create trigger quatre_new_message_notifications after insert on public.community_messages
  for each row execute function public.notify_quatre_new_message();
