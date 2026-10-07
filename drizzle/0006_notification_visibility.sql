drop policy "Users read their notifications" on public.notifications;
--> statement-breakpoint
create policy "Users read their notifications" on public.notifications for select to authenticated
  using (recipient_id = auth.uid() and (
    actor_id is null or (
      public.community_profile_available(actor_id)
      and not exists (select 1 from public.profile_mutes m where m.muter_id = auth.uid() and m.muted_id = actor_id)
    )
  ));
--> statement-breakpoint
drop policy "Users mark their notifications read or unread" on public.notifications;
--> statement-breakpoint
create policy "Users mark their notifications read or unread" on public.notifications for update to authenticated
  using (recipient_id = auth.uid() and (
    actor_id is null or (
      public.community_profile_available(actor_id)
      and not exists (select 1 from public.profile_mutes m where m.muter_id = auth.uid() and m.muted_id = actor_id)
    )
  ))
  with check (recipient_id = auth.uid());
--> statement-breakpoint

create or replace function public.enqueue_quatre_notification(
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

  if notification_kind = 'new_message' and exists (
    select 1 from public.notifications n where n.recipient_id = target_user_id
      and n.actor_id = actor_user_id and n.type = 'new_message'
      and n.created_at > now() - interval '1 minute'
  ) then return; end if;

  insert into public.notifications (recipient_id, actor_id, type, title, body, href, source_type, source_id)
  values (target_user_id, actor_user_id, notification_kind, notification_title, notification_body,
    action_href, event_source_type, event_source_id)
  on conflict (recipient_id, type, source_type, source_id) where source_id is not null do nothing;
end;
$$;
--> statement-breakpoint
revoke all on function public.enqueue_quatre_notification(uuid, uuid, public.quatre_notification_type, text, text, text, text, uuid) from public, anon, authenticated;
