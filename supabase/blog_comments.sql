-- Reader comments under blog posts. Run once in Supabase → SQL Editor, after
-- seller_accounts.sql (readers sign in with the same WhatsApp login as buyers).
-- Safe to re-run.
--
-- A comment shows at once unless it has a link, an email address, a phone number
-- or payment words: those are held ('held') until Admin → Comments publishes
-- them. 'hidden' is a comment the admin took down. The public sees only
-- 'published', and only the first name (author_name), never the number.
-- A reply from the PuppyPlace team is a published row with is_team = true and a
-- parent_id.
--
-- For the Worker only (service key): row level security is on with no policies.
create table if not exists public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_slug text not null,
  post_title text,
  account_id uuid references public.pp_accounts(id) on delete set null,
  author_name text not null default 'A reader',
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'published' check (status in ('published', 'held', 'hidden')),
  held_reason text,
  is_team boolean not null default false,
  parent_id uuid references public.blog_comments(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists blog_comments_post_idx on public.blog_comments (post_slug, created_at) where status = 'published';
create index if not exists blog_comments_status_idx on public.blog_comments (status, created_at desc);
create index if not exists blog_comments_account_idx on public.blog_comments (account_id, created_at desc);

alter table public.blog_comments enable row level security;
revoke all on public.blog_comments from anon, authenticated;
