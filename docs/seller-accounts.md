# Seller accounts and My listings

A seller's account is their WhatsApp number. Nobody fills in a sign-up form.

- **First listing.** When a listing arrives from the WhatsApp assistant, the site saves who sent it in `pet_owners`, using the chat's own number as confirmed by WhatsApp. It creates the account (`pp_accounts`) and returns a one-tap log-in link (`manage_url`). The assistant adds that link to its "✅ Sent!" message.
- **Logging in later.** From the account button in every page's header (`pp-account.js`, *Sign in*), or on `/my-listings.html`, the seller enters their number, gets a 6-digit code on WhatsApp from the store's number, and is in for 30 days. The session is an HttpOnly cookie. Signed in, the button shows their first name and a menu: My listings, Messages, List a pet, Shop orders and account (the shop's own `account.html`), Log out. On a pet's page, its seller sees "This is your listing" with *Mark as sold* and *Edit listing*, which open My listings at that listing (`#sold-<id>`, `#edit-<id>`, `#available-<id>`). Only a browser that has signed in asks the server who it is (`GET /api/me?brief=1`).
- **Which listings are theirs.** The ones sent from their chat, plus the ones that give their number to buyers. This covers listings made before accounts existed.
- **Changes are reviewed.** Price, details, photos and take-downs are saved as a request (`pet_edits`). Nothing changes on the site until it is approved in **Admin → Edit requests**. The owner is told on WhatsApp when a request comes in, and the seller is told when it's approved or turned down.
- **Sold is not reviewed.** *Mark as sold* (*Mark as adopted* for an adoption) works straight away. The listing stays on the site with a SOLD stamp, greyed out and after the pets still available, and buyers can no longer start a chat about it (a conversation already going carries on). It can be marked available again. 60 days after it was marked, the nightly job deletes it, with the photos the seller sent. The owner is told on WhatsApp. The admin can do the same in **Admin → Pets** (🏷️), where sold pets have their own tab. Needs `supabase/sold_pets.sql`, run once.

## Setup

1. Run `supabase/seller_accounts.sql` once in Supabase → SQL Editor. Until then, listings work exactly as before, with no log-in link. Then `supabase/sold_pets.sql` for *Mark as sold*.
2. `SELLER_API_KEY` and `ADMIN_TOKEN_SECRET` are already set. Messages go out through Vendwyze at `VENDWYZE_URL`, which defaults to `https://thrift-unique.prodeegeek9.workers.dev`.

## Safety

- **Log-in codes:** stored only as a hash, valid for 10 minutes, usable once, and blocked after 5 wrong tries. A number can get at most 3 codes per 15 minutes, and one connection at most 10 an hour.
- **Log-in links:** stored only as a hash, valid for 7 days, usable once. A link opens a page with a button rather than logging in straight away, so WhatsApp's link preview can't use it up.
- **Requests:** everything that changes something must come from the site's own pages. New photos must be uploaded through the site.
- **Seller numbers:** a seller's own number is never put on the `pets` table, because the site reads that table openly.

## API

| Route | What it does |
|---|---|
| `POST /api/auth/code` `{ phone }` | Sends a code on WhatsApp |
| `POST /api/auth/verify` `{ phone, code }` | Logs the seller in |
| `GET` / `POST /login-link?t=` | The one-tap link: a button, then log in |
| `POST /api/auth/logout` | Logs out |
| `GET /api/me` | The account, its listings and its requests (`?brief=1`: the account and its listings' ids and slugs, for the header) |
| `POST /api/me/edit` `{ pet_id, kind: 'edit' \| 'remove', changes, note }` | Sends a change or take-down for review |
| `POST /api/me/photo` (multipart `file`) | Uploads a photo for a change request |
| `POST /api/me/sold` `{ pet_id, sold }` | Marks the seller's own live listing sold, or available again (`sold: false`) |
| `POST /api/admin/edits` `{ token, action: 'list' \| 'approve' \| 'reject', id, note }` | Admin review |

## Numbers on My listings

Each live listing shows its page views (all time and this week), how many
buyers opened a WhatsApp chat, and how many sent a message, linking to
Messages. They come from `pet_stats` in `supabase/private_pets.sql`; until that
has run, the listings show without them.
