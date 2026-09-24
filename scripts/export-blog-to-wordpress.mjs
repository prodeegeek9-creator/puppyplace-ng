#!/usr/bin/env node
/*
 * Export the Supabase `blog_posts` table to a WordPress WXR file.
 *
 * Usage:
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=... \
 *     node scripts/export-blog-to-wordpress.mjs [output.xml]
 *
 * Then in WordPress: Tools → Import → WordPress → upload the file, map the
 * authors, and tick "Download and import file attachments" so featured
 * images are copied into the WordPress media library.
 *
 * Slugs are preserved, so /posts/<slug>.html URLs on puppyplace.ng keep working.
 * SEO title / description / focus keyword are written as Yoast SEO fields.
 */
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON;
const OUT = process.argv[2] || 'wordpress-import.xml';

if (!SUPABASE_URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON for published posts only).');
  process.exit(1);
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?select=*&order=published_at.asc.nullslast`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  console.error(`Supabase returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const posts = await res.json();

const cdata = s => `<![CDATA[${String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';
const pad = n => String(n).padStart(2, '0');
const sqlDate = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const WAT_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos, UTC+1, no DST
const meta = (key, value) => value
  ? `\n    <wp:postmeta><wp:meta_key>${cdata(key)}</wp:meta_key><wp:meta_value>${cdata(value)}</wp:meta_value></wp:postmeta>`
  : '';

const authors = new Map();   // display name → login
const categories = new Map(); // name → nicename
for (const p of posts) {
  const name = p.author || 'PuppyPlace Team';
  if (!authors.has(name)) authors.set(name, slugify(name));
  const cat = p.category || 'General';
  if (!categories.has(cat)) categories.set(cat, slugify(cat));
}

let nextId = 1;
const items = [];
for (const p of posts) {
  const postId = nextId++;
  const when = new Date(p.published_at || p.created_at || Date.now());
  const published = p.status === 'published';
  const cat = p.category || 'General';
  const login = authors.get(p.author || 'PuppyPlace Team');
  let thumbId = null;

  if (p.featured_image) {
    thumbId = nextId++;
    let file = `${p.slug}.jpg`;
    try { file = decodeURIComponent(new URL(p.featured_image).pathname.split('/').pop()) || file; } catch {}
    items.push(`  <item>
    <title>${cdata(p.title)}</title>
    <dc:creator>${cdata(login)}</dc:creator>
    <guid isPermaLink="false">${cdata(p.featured_image)}</guid>
    <wp:post_id>${thumbId}</wp:post_id>
    <wp:post_date>${cdata(sqlDate(new Date(when.getTime() + WAT_OFFSET_MS)))}</wp:post_date>
    <wp:post_date_gmt>${cdata(sqlDate(when))}</wp:post_date_gmt>
    <wp:post_name>${cdata(slugify(file.replace(/\.[^.]+$/, '')))}</wp:post_name>
    <wp:status>inherit</wp:status>
    <wp:post_parent>${postId}</wp:post_parent>
    <wp:post_type>attachment</wp:post_type>
    <wp:attachment_url>${cdata(p.featured_image)}</wp:attachment_url>
  </item>`);
  }

  items.push(`  <item>
    <title>${cdata(p.title)}</title>
    <pubDate>${when.toUTCString()}</pubDate>
    <dc:creator>${cdata(login)}</dc:creator>
    <guid isPermaLink="false">${cdata(`supabase-blog-${p.id}`)}</guid>
    <description></description>
    <content:encoded>${cdata(p.content)}</content:encoded>
    <excerpt:encoded>${cdata(p.excerpt)}</excerpt:encoded>
    <wp:post_id>${postId}</wp:post_id>
    <wp:post_date>${cdata(sqlDate(new Date(when.getTime() + WAT_OFFSET_MS)))}</wp:post_date>
    <wp:post_date_gmt>${cdata(published ? sqlDate(when) : '0000-00-00 00:00:00')}</wp:post_date_gmt>
    <wp:comment_status>closed</wp:comment_status>
    <wp:ping_status>closed</wp:ping_status>
    <wp:post_name>${cdata(p.slug)}</wp:post_name>
    <wp:status>${published ? 'publish' : 'draft'}</wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type>post</wp:post_type>
    <wp:post_password></wp:post_password>
    <wp:is_sticky>0</wp:is_sticky>
    <category domain="category" nicename="${categories.get(cat)}">${cdata(cat)}</category>${meta('_thumbnail_id', thumbId && String(thumbId))}${meta('_yoast_wpseo_title', p.meta_title)}${meta('_yoast_wpseo_metadesc', p.meta_description)}${meta('_yoast_wpseo_focuskw', p.focus_keyword)}
  </item>`);
}

const authorXml = [...authors].map(([name, login], i) => `  <wp:author>
    <wp:author_id>${i + 1}</wp:author_id>
    <wp:author_login>${cdata(login)}</wp:author_login>
    <wp:author_email>${cdata('')}</wp:author_email>
    <wp:author_display_name>${cdata(name)}</wp:author_display_name>
  </wp:author>`).join('\n');

const categoryXml = [...categories].map(([name, nicename], i) => `  <wp:category>
    <wp:term_id>${i + 1}</wp:term_id>
    <wp:category_nicename>${cdata(nicename)}</wp:category_nicename>
    <wp:category_parent>${cdata('')}</wp:category_parent>
    <wp:cat_name>${cdata(name)}</wp:cat_name>
  </wp:category>`).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>PuppyPlace Blog</title>
  <link>https://puppyplace.ng</link>
  <description>Pet care tips for Nigerian pet owners</description>
  <language>en-NG</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>https://puppyplace.ng</wp:base_site_url>
  <wp:base_blog_url>https://puppyplace.ng</wp:base_blog_url>
${authorXml}
${categoryXml}
${items.join('\n')}
</channel>
</rss>
`;

writeFileSync(OUT, xml);
const drafts = posts.filter(p => p.status !== 'published').length;
console.log(`Wrote ${posts.length} posts (${drafts} drafts), ${categories.size} categories, ${authors.size} authors → ${OUT}`);
