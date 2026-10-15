-- Sellers' numbers private, and the pets table closed to the public key.
-- The home page now gets pets from the site's server (/api/pets, without
-- numbers) and the admin reads and changes pets through the server with its
-- log-in, so the browser no longer needs any access to this table.
-- Also adds pet_stats, the numbers sellers see on My listings.
-- Run once in Supabase → SQL Editor, AFTER the new site version is live
-- (otherwise the old home page and admin, which still read pets directly,
-- would show no pets until it is). Safe to re-run.

-- 1. Close pets to the browser: remove every policy that let the public
--    (anon) key or signed-in shoppers read or change it.
alter table public.pets enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'pets' loop
    execute format('drop policy %I on public.pets', pol.policyname);
  end loop;
end $$;
revoke all on public.pets from anon, authenticated;

-- 2. What sellers see on My listings: views (all time and this week),
--    WhatsApp chats opened, and buyers who sent a message.
create index if not exists page_views_path_idx on public.page_views (path, viewed_at);
create index if not exists shop_events_path_idx on public.shop_events (path, event);

create or replace function public.pet_stats(p_ids text[])
returns table (pet_id text, views bigint, views_week bigint, whatsapp bigint, messages bigint)
language sql stable security definer set search_path = public as $$
  select p.id::text,
    (select count(*) from page_views v where v.path = '/pets/' || p.slug),
    (select count(*) from page_views v where v.path = '/pets/' || p.slug and v.viewed_at >= now() - interval '7 days'),
    (select count(*) from shop_events e where e.path = '/pets/' || p.slug and e.event = 'whatsapp_click'),
    (select count(*) from pet_threads t where t.pet_id = p.id::text)
  from pets p
  where p.id::text = any(p_ids);
$$;
revoke all on function public.pet_stats(text[]) from public, anon, authenticated;
grant execute on function public.pet_stats(text[]) to service_role;

-- 3. Check: this should list no rows for pets. Rows for other tables show what
--    the public key can still do there.
select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by tablename, policyname;
