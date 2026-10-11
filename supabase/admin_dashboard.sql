-- Admin dashboard: shop events (wishlist adds, cart adds, checkout starts and
-- WhatsApp clicks) and one function that adds everything up for the dashboard.
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Both are for the Worker only (service key): row level security is on with no
-- policies, and the function is not granted to anon or signed-in users.

-- ── EVENTS ───────────────────────────────────────────────────────────────────
-- Wishlists and carts live in the visitor's browser, so without this the site
-- never learns what people save or add. The page sends one small beacon when
-- somebody adds something (no cookies; visitor_hash is the same daily
-- anonymous hash page_views uses).
create table if not exists public.shop_events (
  id bigint generated always as identity primary key,
  event text not null check (event in ('wishlist_add', 'cart_add', 'checkout_start', 'whatsapp_click')),
  item_id text,
  item_name text,
  price numeric,
  path text,
  visitor_hash text,
  created_at timestamptz not null default now()
);
create index if not exists shop_events_created_idx on public.shop_events (created_at desc);
create index if not exists shop_events_event_idx on public.shop_events (event, created_at desc);
alter table public.shop_events enable row level security;
revoke all on public.shop_events from anon, authenticated;

-- ── THE DASHBOARD'S NUMBERS ──────────────────────────────────────────────────
-- admin_overview(30) → one JSON document: traffic, pets, orders, events and the
-- catalogue, for the last N days (7 to 90) and the N days before them (to show
-- up or down). Days are Lagos days. A part whose table is missing or different
-- is returned as null with the reason in <part>_error, so the rest still shows.
create or replace function public.admin_overview(days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d int := greatest(7, least(coalesce(days, 30), 90));
  tz text := 'Africa/Lagos';
  today date := (now() at time zone tz)::date;
  start_day date := (now() at time zone tz)::date - (greatest(7, least(coalesce(days, 30), 90)) - 1);
  prev_start date := (now() at time zone tz)::date - (greatest(7, least(coalesce(days, 30), 90)) - 1) - greatest(7, least(coalesce(days, 30), 90));
  t_start timestamptz;
  t_prev timestamptz;
  res jsonb;
  part jsonb;
begin
  t_start := start_day::timestamp at time zone tz;
  t_prev := prev_start::timestamp at time zone tz;
  res := jsonb_build_object('days', d, 'generated_at', now(), 'today', today, 'start', start_day);

  -- TRAFFIC ------------------------------------------------------------------
  begin
    with v as (
      select path, country, referrer, visitor_hash, duration_seconds, viewed_at,
             (viewed_at at time zone tz)::date as day
      from page_views where viewed_at >= t_prev
    ),
    cur as (select * from v where viewed_at >= t_start),
    prev as (select * from v where viewed_at < t_start)
    select jsonb_build_object(
      'views', (select count(*) from cur),
      'visits', (select count(distinct (day, visitor_hash)) from cur where visitor_hash is not null),
      'prev_views', (select count(*) from prev),
      'prev_visits', (select count(distinct (day, visitor_hash)) from prev where visitor_hash is not null),
      'avg_seconds', (select coalesce(round(avg(duration_seconds) filter (where duration_seconds > 0)), 0) from cur),
      'by_day', (
        select coalesce(jsonb_agg(jsonb_build_object('d', g.day::date, 'views', coalesce(a.views, 0), 'visits', coalesce(a.visits, 0)) order by g.day), '[]')
        from generate_series(start_day, today, interval '1 day') as g(day)
        left join (
          select day, count(*) as views, count(distinct visitor_hash) as visits from cur group by day
        ) a on a.day = g.day::date
      ),
      'top_pages', (
        select coalesce(jsonb_agg(x order by (x->>'views')::int desc), '[]') from (
          select jsonb_build_object('path', path, 'views', count(*), 'visits', count(distinct (day, visitor_hash)),
                 'avg_seconds', coalesce(round(avg(duration_seconds) filter (where duration_seconds > 0)), 0)) as x
          from cur group by path order by count(*) desc limit 12
        ) t
      ),
      'top_referrers', (
        select coalesce(jsonb_agg(x order by (x->>'views')::int desc), '[]') from (
          select jsonb_build_object('name', coalesce(referrer, 'direct'), 'views', count(*)) as x
          from cur group by coalesce(referrer, 'direct') order by count(*) desc limit 8
        ) t
      ),
      'top_countries', (
        select coalesce(jsonb_agg(x order by (x->>'views')::int desc), '[]') from (
          select jsonb_build_object('name', coalesce(country, '--'), 'views', count(*)) as x
          from cur group by coalesce(country, '--') order by count(*) desc limit 8
        ) t
      )
    ) into part;
    res := res || jsonb_build_object('traffic', part);
  exception when others then
    res := res || jsonb_build_object('traffic', null, 'traffic_error', sqlerrm);
  end;

  -- PETS ---------------------------------------------------------------------
  begin
    with p as (
      select to_jsonb(x) as j from pets x
    ),
    q as (
      select j->>'slug' as slug,
             coalesce(nullif(j->>'breed', ''), j->>'name') as breed,
             j->>'type' as type,
             coalesce(j->>'listing_type', 'sale') as listing_type,
             coalesce((j->>'active')::boolean, true) as active,
             nullif(j->>'whatsapp', '') as whatsapp,
             nullif(j->>'breeder', '') as breeder,
             (j->>'created_at')::timestamptz as created_at,
             coalesce(jsonb_array_length(case when jsonb_typeof(j->'image_urls') = 'array' then j->'image_urls' end),
                      case when nullif(j->>'image_url', '') is not null then 1 else 0 end) as photos
      from p
    ),
    pv as (
      select regexp_replace(path, '^/pets/', '') as slug, count(*) as views
      from page_views where viewed_at >= t_start and path like '/pets/%' group by 1
    ),
    ev as (
      select regexp_replace(path, '^/pets/', '') as slug, count(*) as clicks
      from shop_events where event = 'whatsapp_click' and created_at >= t_start and path like '/pets/%' group by 1
    )
    select jsonb_build_object(
      'total', (select count(*) from q),
      'live', (select count(*) from q where active),
      'pending', (select count(*) from q where not active),
      'oldest_pending', (select min(created_at) from q where not active),
      'pending_over_day', (select count(*) from q where not active and created_at < now() - interval '24 hours'),
      'one_photo', (select count(*) from q where photos <= 1),
      'added', (select count(*) from q where created_at >= t_start),
      'prev_added', (select count(*) from q where created_at >= t_prev and created_at < t_start),
      'by_type', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(type, 'Other'), 'n', n, 'live', live) order by n desc), '[]')
                  from (select type, count(*) as n, count(*) filter (where active) as live from q group by type) t),
      'by_listing', (select coalesce(jsonb_agg(jsonb_build_object('name', listing_type, 'n', n) order by n desc), '[]')
                     from (select listing_type, count(*) as n from q group by listing_type) t),
      'by_day', (
        select coalesce(jsonb_agg(jsonb_build_object('d', g.day::date, 'n', coalesce(a.n, 0)) order by g.day), '[]')
        from generate_series(start_day, today, interval '1 day') as g(day)
        left join (select (created_at at time zone tz)::date as day, count(*) as n from q where created_at >= t_start group by 1) a on a.day = g.day::date
      ),
      'sellers', (
        select coalesce(jsonb_agg(x order by (x->>'listings')::int desc), '[]') from (
          select jsonb_build_object('whatsapp', whatsapp, 'name', max(breeder), 'listings', count(*),
                 'live', count(*) filter (where active), 'last', max(created_at)) as x
          from q where whatsapp is not null group by whatsapp order by count(*) desc, max(created_at) desc limit 10
        ) t
      ),
      'top_pets', (
        select coalesce(jsonb_agg(x order by (x->>'views')::int desc), '[]') from (
          select jsonb_build_object('slug', q.slug, 'breed', q.breed, 'views', pv.views, 'clicks', coalesce(ev.clicks, 0)) as x
          from q join pv on pv.slug = q.slug left join ev on ev.slug = q.slug where q.active
          order by pv.views desc limit 8
        ) t
      ),
      'activity', (
        select coalesce(jsonb_object_agg(coalesce(pv.slug, ev.slug), jsonb_build_object('views', coalesce(pv.views, 0), 'clicks', coalesce(ev.clicks, 0))), '{}')
        from pv full join ev on ev.slug = pv.slug
      )
    ) into part;
    res := res || jsonb_build_object('pets', part);
  exception when others then
    res := res || jsonb_build_object('pets', null, 'pets_error', sqlerrm);
  end;

  -- ORDERS -------------------------------------------------------------------
  begin
    with o as (
      select created_at, coalesce(status, 'processing') as status, coalesce(total, 0)::numeric as total, to_jsonb(items) as items,
             (created_at at time zone tz)::date as day
      from orders where created_at >= t_prev
    ),
    cur as (select * from o where created_at >= t_start),
    prev as (select * from o where created_at < t_start),
    lines as (
      select i->>'id' as id, i->>'n' as name,
             coalesce((i->>'qty')::numeric, 1) as qty,
             coalesce((i->>'p')::numeric, 0) * coalesce((i->>'qty')::numeric, 1) as revenue
      from cur, lateral jsonb_array_elements(case when jsonb_typeof(items) = 'array' then items else '[]'::jsonb end) i
      where status <> 'cancelled'
    )
    select jsonb_build_object(
      'count', (select count(*) from cur),
      'prev_count', (select count(*) from prev),
      'revenue', (select coalesce(sum(total), 0) from cur where status <> 'cancelled'),
      'prev_revenue', (select coalesce(sum(total), 0) from prev where status <> 'cancelled'),
      'avg_order', (select coalesce(round(avg(total)), 0) from cur where status <> 'cancelled'),
      'open', (select count(*) from cur where status in ('processing', 'shipped')),
      'stuck', (select count(*) from cur where status = 'processing' and created_at < now() - interval '48 hours'),
      'by_status', (select coalesce(jsonb_agg(jsonb_build_object('name', status, 'n', n) order by n desc), '[]')
                    from (select status, count(*) as n from cur group by status) t),
      'by_day', (
        select coalesce(jsonb_agg(jsonb_build_object('d', g.day::date, 'n', coalesce(a.n, 0), 'revenue', coalesce(a.revenue, 0)) order by g.day), '[]')
        from generate_series(start_day, today, interval '1 day') as g(day)
        left join (select day, count(*) as n, sum(total) filter (where status <> 'cancelled') as revenue from cur group by day) a on a.day = g.day::date
      ),
      'top_products', (
        select coalesce(jsonb_agg(x order by (x->>'revenue')::numeric desc), '[]') from (
          select jsonb_build_object('id', id, 'name', max(name), 'qty', sum(qty), 'revenue', sum(revenue)) as x
          from lines group by id order by sum(revenue) desc limit 8
        ) t
      )
    ) into part;
    res := res || jsonb_build_object('orders', part);
  exception when others then
    res := res || jsonb_build_object('orders', null, 'orders_error', sqlerrm);
  end;

  -- WISHLISTS, CARTS AND CLICKS ------------------------------------------------
  begin
    with e as (
      select event, item_id, item_name, path, created_at, visitor_hash, (created_at at time zone tz)::date as day
      from shop_events where created_at >= t_prev
    ),
    cur as (select * from e where created_at >= t_start),
    prev as (select * from e where created_at < t_start)
    select jsonb_build_object(
      'wishlist', (select count(*) from cur where event = 'wishlist_add'),
      'cart', (select count(*) from cur where event = 'cart_add'),
      'checkout', (select count(*) from cur where event = 'checkout_start'),
      'whatsapp', (select count(*) from cur where event = 'whatsapp_click'),
      'prev_wishlist', (select count(*) from prev where event = 'wishlist_add'),
      'prev_cart', (select count(*) from prev where event = 'cart_add'),
      'prev_checkout', (select count(*) from prev where event = 'checkout_start'),
      'prev_whatsapp', (select count(*) from prev where event = 'whatsapp_click'),
      'by_day', (
        select coalesce(jsonb_agg(jsonb_build_object('d', g.day::date, 'wishlist', coalesce(a.w, 0), 'cart', coalesce(a.c, 0)) order by g.day), '[]')
        from generate_series(start_day, today, interval '1 day') as g(day)
        left join (select day, count(*) filter (where event = 'wishlist_add') as w, count(*) filter (where event = 'cart_add') as c from cur group by day) a on a.day = g.day::date
      ),
      'top_wishlisted', (
        select coalesce(jsonb_agg(x order by (x->>'n')::int desc), '[]') from (
          select jsonb_build_object('id', item_id, 'name', max(item_name), 'n', count(*)) as x
          from cur where event = 'wishlist_add' and item_id is not null group by item_id order by count(*) desc limit 8
        ) t
      ),
      'top_carted', (
        select coalesce(jsonb_agg(x order by (x->>'n')::int desc), '[]') from (
          select jsonb_build_object('id', item_id, 'name', max(item_name), 'n', count(*)) as x
          from cur where event = 'cart_add' and item_id is not null group by item_id order by count(*) desc limit 8
        ) t
      ),
      'first_event', (select min(created_at) from shop_events)
    ) into part;
    res := res || jsonb_build_object('events', part);
  exception when others then
    res := res || jsonb_build_object('events', null, 'events_error', sqlerrm);
  end;

  -- CATALOGUE, GUIDES, BLOG --------------------------------------------------
  begin
    select jsonb_build_object(
      'products', (select count(*) from shop_products),
      'hidden', (select count(*) from shop_products where active = false)
    ) into part;
    res := res || jsonb_build_object('catalogue', part);
  exception when others then
    res := res || jsonb_build_object('catalogue', null, 'catalogue_error', sqlerrm);
  end;

  begin
    select jsonb_build_object(
      'draft', (select count(*) from breed_guides where status = 'draft'),
      'approved', (select count(*) from breed_guides where status = 'approved'),
      'rejected', (select count(*) from breed_guides where status = 'rejected')
    ) into part;
    res := res || jsonb_build_object('guides', part);
  exception when others then
    res := res || jsonb_build_object('guides', null, 'guides_error', sqlerrm);
  end;

  begin
    select jsonb_build_object(
      'published', (select count(*) from blog_posts where status = 'published'),
      'draft', (select count(*) from blog_posts where status is distinct from 'published')
    ) into part;
    res := res || jsonb_build_object('blog', part);
  exception when others then
    res := res || jsonb_build_object('blog', null, 'blog_error', sqlerrm);
  end;

  return res;
end;
$$;

revoke all on function public.admin_overview(int) from public, anon, authenticated;
grant execute on function public.admin_overview(int) to service_role;
