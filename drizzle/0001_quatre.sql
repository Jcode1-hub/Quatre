create type conversation_mode as enum ('solo', 'compare', 'panel', 'auto');
--> statement-breakpoint

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Personal workspace',
  created_at timestamptz not null default now()
);
--> statement-breakpoint
create index workspaces_owner_id_idx on workspaces(owner_id);
--> statement-breakpoint

create table conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  mode conversation_mode not null default 'auto',
  model_config jsonb not null default '{"modelIds": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
--> statement-breakpoint
create index conversations_workspace_id_idx on conversations(workspace_id);
--> statement-breakpoint

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  provider text,
  model text,
  coordination jsonb,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
create index messages_conversation_id_idx on messages(conversation_id);
--> statement-breakpoint

alter table workspaces enable row level security;
--> statement-breakpoint
alter table conversations enable row level security;
--> statement-breakpoint
alter table messages enable row level security;
--> statement-breakpoint

revoke all on workspaces, conversations, messages from anon;
--> statement-breakpoint
grant select, insert, update, delete on workspaces, conversations, messages to authenticated;
--> statement-breakpoint

create policy "Owners manage their workspaces" on workspaces for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
--> statement-breakpoint
create policy "Owners manage their conversations" on conversations for all
  using (exists (select 1 from workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
--> statement-breakpoint
create policy "Owners manage their messages" on messages for all
  using (exists (
    select 1 from conversations c join workspaces w on w.id = c.workspace_id
    where c.id = conversation_id and w.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from conversations c join workspaces w on w.id = c.workspace_id
    where c.id = conversation_id and w.owner_id = auth.uid()
  ));
--> statement-breakpoint
