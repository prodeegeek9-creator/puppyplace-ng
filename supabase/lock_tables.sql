-- Close the tables the public (anon) key could change, and customers' profiles.
-- The admin now changes products, blog posts and store settings through the
-- site's server (/api/admin/data) with its log-in, so the public key only needs
-- to read them. Run once in Supabase → SQL Editor, AFTER the new site version is
-- live (otherwise the old admin couldn't save until it is). Safe to re-run.

-- Drop every policy on these tables, so only the ones below remain.
do $$
declare pol record;
begin
  for pol in select tablename, policyname from pg_policies
             where schemaname = 'public' and tablename in ('profiles', 'shop_products', 'products', 'blog_posts', 'store_settings') loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- 1. profiles: customers' names, phone numbers and emails. Each signed-in
--    customer can read their own; the site's server makes the changes.
alter table public.profiles enable row level security;
create policy "Read own profile" on public.profiles for select to authenticated using (auth.uid()::text = id::text);
-- New sign-ups get their profile from Supabase's sign-up service.
create policy "Sign-up creates profiles" on public.profiles for insert to supabase_auth_admin with check (true);
revoke all on public.profiles from anon;

-- 2. Shop products (and the older products table): anyone can read, only the
--    server can change.
alter table public.shop_products enable row level security;
create policy "Public read" on public.shop_products for select to anon, authenticated using (true);

alter table public.products enable row level security;
create policy "Public read" on public.products for select to anon, authenticated using (true);

-- 3. Blog posts: anyone can read published posts, only the server can change.
alter table public.blog_posts enable row level security;
create policy "Public read published" on public.blog_posts for select to anon, authenticated using (status = 'published');

-- 4. Store settings (homepage images and layout): anyone can read, only the
--    server can change.
alter table public.store_settings enable row level security;
create policy "Public read" on public.store_settings for select to anon, authenticated using (true);

-- 5. Page views are counted by the server; the browser doesn't need to add them.
drop policy if exists "allow_insert" on public.page_views;

-- 6. Files: only the site's server and n8n upload (both use the secret key,
--    which these rules don't affect). Added 15 Oct 2026.
drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists "Service video upload" on storage.objects;
alter policy "Service insert" on public.video_posts to service_role;

-- Check: tables still fully open (no row level security), and every policy left,
-- including the storage (file) ones.
select 'table' as kind, c.relname as name, 'OPEN: no row level security' as detail
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity
union all
select 'policy', schemaname || '.' || tablename || ': ' || policyname, array_to_string(roles, ',') || ' · ' || cmd
from pg_policies where schemaname in ('public', 'storage')
order by 1, 2;
