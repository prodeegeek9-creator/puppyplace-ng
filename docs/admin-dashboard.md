# Admin dashboard

Admin → **Dashboard**, **Orders** and **Pets** read their numbers from the Worker, which holds the database key. Nothing here is readable without the admin sign-in.

## Setup (once)

Run `supabase/admin_dashboard.sql` in Supabase → SQL Editor. It is safe to re-run. It creates:

- `shop_events`: one row each time a visitor adds to the wishlist or cart, starts checkout, or taps a WhatsApp button on a pet page. No cookies; `visitor_hash` is the same daily anonymous hash `page_views` uses.
- `admin_overview(days)`: one function that adds up traffic, pets, orders, events and the catalogue for the last 7 to 90 days and the same number of days before (for the up and down arrows). Days are Lagos days. A part whose table is missing comes back empty with the reason, and the rest still shows.

Until it is run the dashboard says so and the rest of the admin works as before. Wishlist and cart numbers only count from the day the SQL is run (and this version is live); older ones were never recorded because wishlists and carts live in the visitor's browser.

## What it shows

- **Dashboard**: what needs attention (pets and breed guides waiting, orders stuck over 2 days, pets with one photo), visits and views, orders and revenue (cancelled orders not counted), new listings, wishlist, cart, checkout and WhatsApp counts, daily charts, top pages, referrers and countries, best sellers, most wishlisted and carted, top pet pages, most active sellers, and a visit-to-order funnel.
- **Orders**: every order with search (name, email, phone, reference, item), status tabs, date range, sorting, a detail view (items, address, notes, WhatsApp, call and email buttons), a status change (processing, shipped, delivered, cancelled) and CSV export.
- **Pets**: search, status tabs (including "Needs a fix"), type and listing filters, sorting (including most viewed), photo count, views and WhatsApp clicks over 30 days, a detail view with every photo, who sent it and what is missing or looks wrong, approve or hide, and CSV export. "Looks wrong" catches answers that went into the wrong box on WhatsApp: a price under ₦1,000 (usually ₦70 meant as ₦70,000), a breed that reads like a message, an age that is a question, and a seller name that is the pet's name or a stray word ("Done", "Or", "Zoe is her name").

## API (admin token, from the sign-in)

| Route | Body | Returns |
|---|---|---|
| `POST /api/admin/overview` | `{ token, days }` | `{ ok, overview }`; 503 with `setup: true` when the SQL has not been run |
| `POST /api/admin/orders` | `{ token, action: 'list' }` | `{ ok, orders }`, newest 500 |
| `POST /api/admin/orders` | `{ token, action: 'status', id, status }` | `{ ok }` |
| `POST /api/track-event` | `{ event, id?, name?, price?, path? }` | 204 always; `event` is `wishlist_add`, `cart_add`, `checkout_start` or `whatsapp_click`; bots and other origins are ignored; data centre and VPN networks are counted here (a button tap is a person), though their page views are not |
