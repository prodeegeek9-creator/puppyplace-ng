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
- **Pets**: search, status tabs (including "Sold" and "Needs a fix"), a 🏷️ button to mark a pet sold (stamped SOLD, removed after 60 days) or available again, type and listing filters, sorting (including most viewed), photo count, views and WhatsApp clicks over 30 days, when each was uploaded (day and time, and how long ago), a detail view with every photo, who sent it and what is missing or looks wrong, approve or hide, and CSV export. "Looks wrong" catches answers that went into the wrong box on WhatsApp: a price under ₦1,000 (usually ₦70 meant as ₦70,000), a breed that reads like a message, an age that is a question, and a seller name that is the pet's name or a stray word ("Done", "Or", "Zoe is her name").

- **Leads**: every buyer who tapped **Contact on WhatsApp** or sent a first **message** to a seller (Last 7, 30 or 90 days, latest 500): when, what they did, who (name and number, tappable), which pet, and **where they came from**: the site or post the visit began from (Instagram, Facebook, Google, TikTok…, or Direct), the first page they landed on and the page just before the pet's page. A summary line counts leads by source; a message lead has 👁️ to read the conversation (Messages shows the same chat in full).

  Where-from is remembered by `/pp-pixel.js` on every page (`pp_entry` in the browser's session storage) and sent by `pp-contact.js` with the tap (`/api/contact?…&fu=&er=&ep=&pg=`, and `src` on `/api/dm/send`). The Worker keeps our own pages' path and `?query` (the `utm_` tags say which post or ad) and another site's address without its query. **Run `supabase/lead_sources.sql` once** in Supabase → SQL Editor to add the four columns to `pet_leads`; until then leads are still saved and listed, without where-from (Leads says so).

## API (admin token, from the sign-in)

| Route | Body | Returns |
|---|---|---|
| `POST /api/admin/overview` | `{ token, days }` | `{ ok, overview }`; 503 with `setup: true` when the SQL has not been run |
| `POST /api/admin/orders` | `{ token, action: 'list' }` | `{ ok, orders }`, newest 500 |
| `POST /api/admin/orders` | `{ token, action: 'status', id, status }` | `{ ok }` |
| `POST /api/admin/leads` | `{ token, days }` | `{ ok, days, sources, leads }`, newest 500: `{ id, kind: 'whatsapp'\|'message', at, buyer: { name, phone }, pet: { slug, breed, type }, from_url, entry_ref, entry_page, page, thread_id }`; `sources` is false until `lead_sources.sql` has been run |
| `POST /api/track-event` | `{ event, id?, name?, price?, path? }` | 204 always; `event` is `wishlist_add`, `cart_add`, `checkout_start` or `whatsapp_click`; bots and other origins are ignored; data centre and VPN networks are counted here (a button tap is a person), though their page views are not |
