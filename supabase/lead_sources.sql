-- Where each buyer came from when they tapped "Contact on WhatsApp" or sent a
-- first message (Admin → Leads). Run once in Supabase → SQL Editor, after
-- messages.sql. Safe to re-run. Until it has been run, leads are still saved
-- and listed, just without these four.
--
-- All four are a path or a web address, cleaned by the Worker (our own pages keep
-- their ?query, another site keeps its address without one), and empty when
-- there is nothing to say (a visitor who typed the address or used a bookmark).
alter table public.pet_leads add column if not exists from_url text;     -- the page just before the pet's page
alter table public.pet_leads add column if not exists entry_ref text;    -- the site or post the visit began from
alter table public.pet_leads add column if not exists entry_page text;   -- the first page of the visit
alter table public.pet_leads add column if not exists page text;         -- the page the button was on
