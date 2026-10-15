# Photos through Cloudflare, and what the public key can do

## Photos

Every photo on the site is stored in Supabase (the `hero-images` bucket). The
free Supabase plan allows 5 GB of downloads a month, and in September–October
2026 the site used 9.7 GB ("cached egress"), which started a grace period
ending 10 November 2026.

Photos are now served from `https://puppyplace.ng/img/<path>`, which the Worker
answers from Cloudflare's cache (free) and only asks Supabase for a photo the
first time a Cloudflare location sees it in 30 days. The files themselves stay
where they are; only the links change:

- Pages the Worker draws (pet pages, pet lists, product pages, blog) and the
  `/api/pets` and `/api/blog-posts` data have their Supabase photo links
  rewritten to `/img/…` (`viaCdn` in worker.js).
- The home and shop pages read products, blog posts and banner settings from
  Supabase in the browser; their Supabase client rewrites the photo links in
  what it receives (`ppCdnFetch`).
- Link previews (`/api/og-img`, used by WhatsApp and Facebook) are cached too.

Photos are also sent resized: `/img/<path>` gives browsers that take WebP a
WebP copy 1,200 px wide, and `?w=` asks for another size (200, 400, 600, 800,
1,200 or 1,600; product and pet cards ask for 600, cart thumbnails for 200). The
resizing is done by wsrv.nl, the free service the link previews already used,
and the result is kept in Cloudflare's cache for 30 days. If wsrv.nl fails, the
original is sent and kept for a day only.

### Stored photos are kept at most 1,600 px wide

In October 2026 the 448 stored photos averaged 1.5 MB. Now:

- New photos (WhatsApp listings, sellers' edit photos, admin uploads) are
  replaced by a 1,600 px copy right after they are saved, when that saves at
  least a fifth of the size.
- Admin → Settings → **Shrink stored photos** does the same for photos already
  there, 8 at a time (`/api/admin/shrink-photos`). Files keep their names and
  links; the full-size originals are not kept. JPEGs stay JPEG; PNGs are saved
  as WebP (served as `image/webp` under their `.png` name), because most of the
  stored PNGs were photos (325 files, 570 MB) and re-saving a photo as PNG
  barely shrinks it. The site logo, which is also the browser-tab icon, is left
  alone.

Videos for social posting (`puppy-videos`, 2.6 MB each on average) are fetched by
Facebook, Instagram and WhatsApp straight from Supabase. They are small enough
not to matter much.

## What the public key can do

The public (anon) key is in every page, so anything it may change, anyone may
change. After `supabase/lock_tables.sql`:

| Table | Public key |
|---|---|
| `pets` | nothing (`private_pets.sql`) |
| `shop_products`, `products`, `store_settings` | read |
| `blog_posts` | read published posts |
| `profiles` | nothing; a signed-in customer reads their own |
| `orders` | place an order, see their own (checkout) |

The admin changes products, posts and settings through `/api/admin/data` with
its log-in, which allows only those three tables.
