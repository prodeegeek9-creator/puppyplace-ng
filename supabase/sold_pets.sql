-- Sold pets: when a seller (My listings) or the admin marks a pet sold, it
-- stays on the site, stamped SOLD (ADOPTED for an adoption) and greyed out,
-- and the nightly job deletes it 60 days later. This adds the date it was
-- marked. Run once in Supabase → SQL Editor. Safe to re-run. Until it has
-- run, the site works as before and nothing shows as sold.

alter table public.pets add column if not exists sold_at timestamptz;

-- The nightly job looks for sold pets past their 60 days.
create index if not exists pets_sold_at_idx on public.pets (sold_at) where sold_at is not null;
