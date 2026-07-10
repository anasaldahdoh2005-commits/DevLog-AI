create table if not exists public.linkedin_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists linkedin_oauth_states_user_id_idx
  on public.linkedin_oauth_states (user_id);

create index if not exists linkedin_oauth_states_expires_at_idx
  on public.linkedin_oauth_states (expires_at);

alter table public.linkedin_oauth_states enable row level security;

revoke all on public.linkedin_oauth_states from anon, authenticated;

create table if not exists public.linkedin_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  linkedin_sub text not null,
  author_urn text not null,
  display_name text not null default '',
  picture_url text not null default '',
  access_token text not null,
  scope text not null default '',
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists linkedin_accounts_linkedin_sub_idx
  on public.linkedin_accounts (linkedin_sub);

alter table public.linkedin_accounts enable row level security;

revoke all on public.linkedin_accounts from anon, authenticated;
