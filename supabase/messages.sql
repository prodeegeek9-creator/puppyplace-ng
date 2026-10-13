-- Messages between buyers and sellers. A buyer signs in with their WhatsApp
-- number (supabase/seller_accounts.sql) and messages a seller from the pet's
-- page; each side is told on WhatsApp with a link to /messages.html, and
-- neither sees the other's number. Run once in Supabase → SQL Editor, after
-- seller_accounts.sql. Safe to re-run.
--
-- For the Worker only (service key): row level security is on with no policies.

-- One conversation per buyer per pet.
create table if not exists public.pet_threads (
  id uuid primary key default gen_random_uuid(),
  pet_id text not null,
  pet_slug text,
  pet_breed text,
  buyer_id uuid not null references public.pp_accounts(id) on delete cascade,
  seller_phone text not null,
  buyer_unread int not null default 0,
  seller_unread int not null default 0,
  flagged boolean not null default false,     -- mentions a deposit, a transfer, an account number…
  reported_at timestamptz,
  report_reason text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (pet_id, buyer_id)
);
create index if not exists pet_threads_buyer_idx on public.pet_threads (buyer_id, last_message_at desc);
create index if not exists pet_threads_seller_idx on public.pet_threads (seller_phone, last_message_at desc);
create index if not exists pet_threads_pet_idx on public.pet_threads (pet_id);

create table if not exists public.pet_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.pet_threads(id) on delete cascade,
  sender text not null check (sender in ('buyer', 'seller')),
  sender_id uuid references public.pp_accounts(id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pet_messages_thread_idx on public.pet_messages (thread_id, created_at);
create index if not exists pet_messages_sender_idx on public.pet_messages (sender_id, created_at desc);

-- Each time a signed-in buyer opens a seller's WhatsApp chat or starts a conversation.
create table if not exists public.pet_leads (
  id bigint generated always as identity primary key,
  pet_id text not null,
  account_id uuid references public.pp_accounts(id) on delete set null,
  kind text not null check (kind in ('whatsapp', 'message')),
  created_at timestamptz not null default now()
);
create index if not exists pet_leads_account_idx on public.pet_leads (account_id, created_at desc);
create index if not exists pet_leads_pet_idx on public.pet_leads (pet_id, created_at desc);

alter table public.pet_threads enable row level security;
alter table public.pet_messages enable row level security;
alter table public.pet_leads enable row level security;
revoke all on public.pet_threads, public.pet_messages, public.pet_leads from anon, authenticated;
