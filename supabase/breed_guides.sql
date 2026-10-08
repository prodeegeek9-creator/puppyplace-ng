-- Breed guides: a short "About the breed / Temperament / Best home" text for
-- each breed listed, shown on the pet's page once approved in Admin → Breed
-- guides. Written by the listing assistant the first time a breed is listed
-- (as a draft), reviewed and approved here, then used by every listing of that
-- breed. Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Row level security is on with no policies: only the Worker (service key)
-- reads or writes this table, never the browser.
create table if not exists public.breed_guides (
  breed_key text primary key,
  breed_name text not null,
  pet_type text,
  summary text not null check (char_length(summary) between 20 and 1500),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.breed_guides enable row level security;
