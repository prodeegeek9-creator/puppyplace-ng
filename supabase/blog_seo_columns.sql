-- SEO fields for blog posts (used by admin.html and worker.js).
-- Run once in Supabase → SQL Editor. Safe to re-run.
alter table public.blog_posts
  add column if not exists meta_title       text,
  add column if not exists meta_description text,
  add column if not exists focus_keyword    text;
