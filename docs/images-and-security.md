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

Videos for social posting (`puppy-videos`) are fetched by Facebook, Instagram
and WhatsApp straight from Supabase and are not covered by this.

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
