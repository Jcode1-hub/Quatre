alter table public.profiles
  add column username text,
  add column plan text not null default 'free',
  add column bio text not null default '',
  add column occupation text,
  add column region text,
  add column roles jsonb not null default '[]'::jsonb,
  add column interests jsonb not null default '[]'::jsonb,
  add column skills jsonb not null default '[]'::jsonb,
  add column usage_interests jsonb not null default '[]'::jsonb,
  add column community_visible boolean not null default false,
  add column contact_policy text not null default 'requests',
  add column onboarding_completed_at timestamptz,
  add column avatar_storage_path text;
--> statement-breakpoint

alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'plus', 'max'));
--> statement-breakpoint
revoke update on public.profiles from authenticated;
--> statement-breakpoint
grant update (display_name, avatar_url, username, bio, occupation, region, roles, interests, skills,
  usage_interests, community_visible, contact_policy, onboarding_completed_at, avatar_storage_path, updated_at)
  on public.profiles to authenticated;
--> statement-breakpoint
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-zA-Z0-9_]{3,24}$');
--> statement-breakpoint
alter table public.profiles add constraint profiles_contact_policy_check
  check (contact_policy in ('requests', 'connections', 'nobody'));
--> statement-breakpoint
alter table public.profiles add constraint profiles_preference_arrays_check
  check (jsonb_typeof(roles) = 'array' and jsonb_typeof(interests) = 'array'
    and jsonb_typeof(skills) = 'array' and jsonb_typeof(usage_interests) = 'array');
--> statement-breakpoint
create unique index profiles_username_unique on public.profiles (lower(username)) where username is not null;
--> statement-breakpoint
drop policy "Users read their own profile" on public.profiles;
--> statement-breakpoint
create policy "Users read their own profile or discoverable profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or community_visible = true);
--> statement-breakpoint

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quatre-avatars', 'quatre-avatars', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 4194304,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
--> statement-breakpoint
create policy "Avatar owners upload their own image" on storage.objects for insert to authenticated
  with check (bucket_id = 'quatre-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
--> statement-breakpoint
create policy "Avatar owners and discoverable profile viewers read images" on storage.objects for select to authenticated
  using (bucket_id = 'quatre-avatars' and (
    owner_id = auth.uid()::text or exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.avatar_storage_path = name and p.community_visible = true
    )
  ));
--> statement-breakpoint
create policy "Avatar owners replace their own image" on storage.objects for update to authenticated
  using (bucket_id = 'quatre-avatars' and owner_id = auth.uid()::text)
  with check (bucket_id = 'quatre-avatars' and owner_id = auth.uid()::text);
--> statement-breakpoint
create policy "Avatar owners remove their own image" on storage.objects for delete to authenticated
  using (bucket_id = 'quatre-avatars' and owner_id = auth.uid()::text);
--> statement-breakpoint

create table public.profile_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
--> statement-breakpoint
alter table public.profile_blocks enable row level security;
--> statement-breakpoint
revoke all on public.profile_blocks from anon;
--> statement-breakpoint
grant select, insert, delete on public.profile_blocks to authenticated;
--> statement-breakpoint
create policy "Users manage their own blocks" on public.profile_blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
--> statement-breakpoint
create table public.profile_mutes (
  muter_id uuid not null references auth.users(id) on delete cascade,
  muted_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id <> muted_id)
);
--> statement-breakpoint
alter table public.profile_mutes enable row level security;
--> statement-breakpoint
revoke all on public.profile_mutes from anon;
--> statement-breakpoint
grant select, insert, delete on public.profile_mutes to authenticated;
--> statement-breakpoint
create policy "Users manage their own mutes" on public.profile_mutes for all to authenticated
  using (muter_id = auth.uid()) with check (muter_id = auth.uid());
--> statement-breakpoint

create function public.community_profile_available(profile_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select profile_user_id <> auth.uid()
    and exists (select 1 from public.profiles p where p.id = profile_user_id and p.community_visible = true)
    and not exists (
      select 1 from public.profile_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = profile_user_id)
         or (b.blocker_id = profile_user_id and b.blocked_id = auth.uid())
    );
$$;
--> statement-breakpoint
revoke all on function public.community_profile_available(uuid) from public, anon;
--> statement-breakpoint
grant execute on function public.community_profile_available(uuid) to authenticated;
--> statement-breakpoint
drop policy "Users read their own profile or discoverable profiles" on public.profiles;
--> statement-breakpoint
create policy "Users read their own profile" on public.profiles for select to authenticated
  using (id = auth.uid());
--> statement-breakpoint
create function public.search_community_profiles(search_term text default null)
returns table (
  id uuid, display_name text, username text, bio text, occupation text, region text,
  roles jsonb, interests jsonb, skills jsonb, usage_interests jsonb,
  community_visible boolean, contact_policy text, avatar_url text, avatar_storage_path text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.username, p.bio, p.occupation, p.region,
    p.roles, p.interests, p.skills, p.usage_interests,
    p.community_visible, p.contact_policy, p.avatar_url, p.avatar_storage_path
  from public.profiles p
  where auth.uid() is not null and p.id <> auth.uid()
    and public.community_profile_available(p.id)
    and (nullif(left(trim(coalesce(search_term, '')), 80), '') is null or
      concat_ws(' ', p.display_name, p.username, p.bio, p.occupation, p.region,
        p.roles::text, p.interests::text, p.skills::text, p.usage_interests::text)
        ilike '%' || left(trim(search_term), 80) || '%')
  order by p.display_name asc nulls last, p.created_at desc
  limit 40;
$$;
--> statement-breakpoint
revoke all on function public.search_community_profiles(text) from public, anon;
--> statement-breakpoint
grant execute on function public.search_community_profiles(text) to authenticated;
--> statement-breakpoint
create function public.can_read_community_avatar(object_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    split_part(object_path, '/', 1) = auth.uid()::text
    or exists (
      select 1 from public.profiles p
      where p.avatar_storage_path = object_path and public.community_profile_available(p.id)
    )
  );
$$;
--> statement-breakpoint
revoke all on function public.can_read_community_avatar(text) from public, anon;
--> statement-breakpoint
grant execute on function public.can_read_community_avatar(text) to authenticated;
--> statement-breakpoint
drop policy "Avatar owners and discoverable profile viewers read images" on storage.objects;
--> statement-breakpoint
create policy "Owners and community profile viewers read avatars" on storage.objects for select to authenticated
  using (bucket_id = 'quatre-avatars' and public.can_read_community_avatar(name));
--> statement-breakpoint

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id),
  unique (requester_id, recipient_id)
);
--> statement-breakpoint
alter table public.connections enable row level security;
--> statement-breakpoint
revoke all on public.connections from anon;
--> statement-breakpoint
grant select, insert, delete on public.connections to authenticated;
grant update (status, updated_at) on public.connections to authenticated;
--> statement-breakpoint
create policy "Users see their own connection requests" on public.connections for select to authenticated
  using ((requester_id = auth.uid() or recipient_id = auth.uid())
    and public.community_profile_available(case when requester_id = auth.uid() then recipient_id else requester_id end));
--> statement-breakpoint
create policy "Users request connections with discoverable profiles" on public.connections for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and public.community_profile_available(recipient_id));
--> statement-breakpoint
create policy "Recipients respond to connection requests" on public.connections for update to authenticated
  using (recipient_id = auth.uid() and status = 'pending' and public.community_profile_available(requester_id))
  with check (recipient_id = auth.uid() and status in ('accepted', 'declined') and public.community_profile_available(requester_id));
--> statement-breakpoint
create policy "Requesters cancel connection requests" on public.connections for delete to authenticated
  using (requester_id = auth.uid() and status = 'pending');
--> statement-breakpoint

create function public.community_can_message(profile_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.community_profile_available(profile_user_id) and exists (
    select 1 from public.profiles p
    where p.id = profile_user_id and p.contact_policy <> 'nobody'
      and (p.contact_policy = 'requests' or exists (
        select 1 from public.connections c where c.status = 'accepted'
          and ((c.requester_id = auth.uid() and c.recipient_id = p.id)
            or (c.recipient_id = auth.uid() and c.requester_id = p.id))
      ))
  );
$$;
--> statement-breakpoint
revoke all on function public.community_can_message(uuid) from public, anon;
--> statement-breakpoint
grant execute on function public.community_can_message(uuid) to authenticated;
--> statement-breakpoint

create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('harassment', 'impersonation', 'private_information', 'scam', 'other')),
  details text check (details is null or length(details) <= 1200),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);
--> statement-breakpoint
alter table public.community_reports enable row level security;
--> statement-breakpoint
revoke all on public.community_reports from anon, authenticated;
--> statement-breakpoint
grant insert on public.community_reports to authenticated;
--> statement-breakpoint
create policy "Users submit reports without reading reporter records" on public.community_reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.community_profile_available(reported_user_id));
--> statement-breakpoint

create table public.community_threads (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id),
  unique (requester_id, recipient_id)
);
--> statement-breakpoint
create table public.community_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.community_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
--> statement-breakpoint
alter table public.community_threads enable row level security;
--> statement-breakpoint
alter table public.community_messages enable row level security;
--> statement-breakpoint
revoke all on public.community_threads, public.community_messages from anon;
--> statement-breakpoint
grant select, insert on public.community_threads to authenticated;
grant update (status, updated_at) on public.community_threads to authenticated;
--> statement-breakpoint
grant select, insert on public.community_messages to authenticated;
--> statement-breakpoint
create policy "Participants view their message requests" on public.community_threads for select to authenticated
  using ((requester_id = auth.uid() or recipient_id = auth.uid())
    and public.community_profile_available(case when requester_id = auth.uid() then recipient_id else requester_id end));
--> statement-breakpoint
create policy "Users create message requests to discoverable profiles" on public.community_threads for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and public.community_can_message(recipient_id));
--> statement-breakpoint
create policy "Recipients accept or decline message requests" on public.community_threads for update to authenticated
  using (recipient_id = auth.uid() and status = 'pending' and public.community_profile_available(requester_id))
  with check (recipient_id = auth.uid() and status in ('accepted', 'declined') and public.community_profile_available(requester_id));
--> statement-breakpoint
create policy "Thread participants view messages" on public.community_messages for select to authenticated
  using (sender_id = auth.uid() or exists (
    select 1 from public.community_threads t
    where t.id = thread_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid())
      and public.community_profile_available(case when t.requester_id = auth.uid() then t.recipient_id else t.requester_id end)
  ));
--> statement-breakpoint
create policy "Participants send request or accepted thread messages" on public.community_messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (
    select 1 from public.community_threads t where t.id = thread_id
      and (t.requester_id = auth.uid() or t.recipient_id = auth.uid())
      and public.community_profile_available(case when t.requester_id = auth.uid() then t.recipient_id else t.requester_id end)
      and (t.status = 'accepted' or (t.status = 'pending' and t.requester_id = auth.uid()
        and not exists (select 1 from public.community_messages existing where existing.thread_id = t.id)))
  ));
--> statement-breakpoint

create function public.guard_community_interaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  first_user uuid;
  second_user uuid;
begin
  if tg_table_name = 'community_messages' then
    select requester_id, recipient_id into first_user, second_user
    from public.community_threads where id = new.thread_id;
  else
    first_user := new.requester_id;
    second_user := new.recipient_id;
  end if;

  if exists (
    select 1 from public.profile_blocks b
    where (b.blocker_id = first_user and b.blocked_id = second_user)
       or (b.blocker_id = second_user and b.blocked_id = first_user)
  ) then
    raise exception 'Interaction unavailable.' using errcode = '42501';
  end if;
  return new;
end;
$$;
--> statement-breakpoint
revoke all on function public.guard_community_interaction() from public, anon, authenticated;
--> statement-breakpoint
create trigger guard_connection_blocks before insert or update on public.connections
  for each row execute procedure public.guard_community_interaction();
--> statement-breakpoint
create trigger guard_message_request_blocks before insert or update on public.community_threads
  for each row execute procedure public.guard_community_interaction();
--> statement-breakpoint
create trigger guard_message_blocks before insert on public.community_messages
  for each row execute procedure public.guard_community_interaction();
