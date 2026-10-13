-- Seller accounts: a WhatsApp number is an account. Sellers get one with their
-- first listing (the assistant sends them a log-in link); anyone can log in with
-- a code sent to their WhatsApp. Logged-in sellers ask for changes to their
-- listings on /my-listings.html; the changes wait in Admin → Edit requests.
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- For the Worker only (service key): row level security is on with no policies.

create table if not exists public.pp_accounts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^[0-9]{10,15}$'),
  name text,
  is_seller boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- 6-digit codes sent on WhatsApp. Only a hash is kept.
create table if not exists public.pp_login_codes (
  id bigint generated always as identity primary key,
  phone text not null,
  code_hash text not null,
  attempts int not null default 0,
  ip_hash text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pp_login_codes_phone_idx on public.pp_login_codes (phone, created_at desc);
create index if not exists pp_login_codes_ip_idx on public.pp_login_codes (ip_hash, created_at desc);

-- One-tap log-in links sent with a seller's listing. Only a hash is kept; each works once.
create table if not exists public.pp_login_links (
  token_hash text primary key,
  phone text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Who sent each listing: the WhatsApp number it came from (confirmed by
-- WhatsApp), which can differ from the number buyers are given. Kept out of the
-- pets table, which the site reads openly.
create table if not exists public.pet_owners (
  pet_id text primary key,
  phone text not null,
  created_at timestamptz not null default now()
);
create index if not exists pet_owners_phone_idx on public.pet_owners (phone);

-- A seller's request to change or take down a listing, applied when approved.
create table if not exists public.pet_edits (
  id uuid primary key default gen_random_uuid(),
  pet_id text not null,
  account_id uuid references public.pp_accounts(id) on delete set null,
  kind text not null default 'edit' check (kind in ('edit', 'remove')),
  changes jsonb not null default '{}'::jsonb,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists pet_edits_status_idx on public.pet_edits (status, created_at);
create index if not exists pet_edits_pet_idx on public.pet_edits (pet_id);
create index if not exists pet_edits_account_idx on public.pet_edits (account_id, created_at desc);

alter table public.pp_accounts enable row level security;
alter table public.pp_login_codes enable row level security;
alter table public.pp_login_links enable row level security;
alter table public.pet_owners enable row level security;
alter table public.pet_edits enable row level security;
revoke all on public.pp_accounts, public.pp_login_codes, public.pp_login_links, public.pet_owners, public.pet_edits from anon, authenticated;
