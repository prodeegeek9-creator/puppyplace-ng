# Blog on WordPress (headless)

Posts are written in WordPress, but readers never visit the WordPress site.
puppyplace.ng fetches the posts over the WordPress REST API and renders them in
its own design at the same URLs as before:

| Page | Source |
|------|--------|
| `/posts/<slug>.html` | Rendered on the server by `worker.js` (SEO meta, JSON-LD, AdSense) |
| `/blog.html`, homepage blog section | `GET /api/blog-posts` (worker) |
| `/sitemap.xml` (worker version) | Includes every published WordPress post |

The worker reads from WordPress only when the `WORDPRESS_URL` variable is set.
Until then it keeps reading the Supabase `blog_posts` table, so you can deploy
this change before WordPress is ready.

## Why headless (SEO and AdSense)

- **URLs stay the same.** Google keeps the rankings that `/posts/…` already has,
  with no redirects to set up.
- **Everything stays on puppyplace.ng.** Links and traffic count towards the main
  domain, not a separate `blog.` subdomain.
- **AdSense needs no new approval.** Ads run on the site that's already approved,
  and the blog uses the same publisher ID.

## Setup

1. **Install WordPress** on a subdomain such as `cms.puppyplace.ng`. Any host
   works, including WordPress.com Business plan or higher.
2. **Settings → Permalinks** → Custom structure: `/posts/%postname%/`
   (internal links between posts are then rewritten to `/posts/<slug>.html`).
3. **Hide the WordPress front end from Google** to avoid duplicate content:
   *Settings → Reading → Discourage search engines from indexing this site*.
   This does not affect the REST API.
4. Optional: install **Yoast SEO**. The SEO title and meta description you set
   there are used on puppyplace.ng.
5. **Import the existing posts:**
   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_KEY=<service key> \
     node scripts/export-blog-to-wordpress.mjs wordpress-import.xml
   ```
   Then in WordPress, go to *Tools → Import → WordPress*, upload the file, assign
   the authors and tick **Download and import file attachments**.
   Slugs, categories, drafts, featured images and SEO fields carry over.
6. **Switch over:** in Cloudflare, go to *Workers → puppyplace-ng → Settings →
   Variables*, add `WORDPRESS_URL = https://cms.puppyplace.ng` and deploy.
7. Check a few `/posts/<slug>.html` pages, then stop using the blog editor in
   `admin.html`. Once `WORDPRESS_URL` is set, it shows a link to wp-admin.

## Notes

- WordPress responses are cached at the edge for 5 minutes, so new posts can
  take up to 5 minutes to appear.
- Category colours are picked automatically from the category name. Posts
  without a featured image show the 📝 placeholder.
- Read time is worked out from the word count, at 200 words per minute.
