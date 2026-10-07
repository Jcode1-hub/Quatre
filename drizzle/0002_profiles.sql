create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
alter table profiles enable row level security;
--> statement-breakpoint
revoke all on profiles from anon;
--> statement-breakpoint
grant select, update on profiles to authenticated;
--> statement-breakpoint
create policy "Users read their own profile" on profiles for select using (id = auth.uid());
--> statement-breakpoint
create policy "Users update their own profile" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
--> statement-breakpoint

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), new.raw_user_meta_data ->> 'avatar_url');
  insert into public.workspaces (owner_id, name) values (new.id, 'Personal workspace');
  return new;
end;
$$;
--> statement-breakpoint
revoke all on function public.handle_new_user() from public, anon, authenticated;
--> statement-breakpoint
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();
