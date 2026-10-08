# Seller listings API (Vendwyze → PuppyPlace)

Vendwyze chats with people who want to sell or rehome a pet, then sends the
finished listing here. PuppyPlace saves it **hidden** (`pets.active = false`).
It appears in **Admin → Pets** with a ⏳ Pending badge, the seller's WhatsApp
number and a ✅ button. Once approved it shows on `/pets.html`, gets its own
`/pets/<slug>` page and is added to the sitemap.

## Setup (Cloudflare → Workers → puppyplace-ng → Settings → Variables)

| Variable | Required | What it is |
|---|---|---|
| `SELLER_API_KEY` | yes | A long random secret shared with Vendwyze. The endpoint returns 503 until it is set. |
| `SELLER_ALERT_WEBHOOK` | no | A URL (e.g. an n8n webhook) that receives a JSON alert for each new pending listing, so you can get a WhatsApp ping. |

## Request

```
POST https://puppyplace.ng/api/seller-listings
Authorization: Bearer <SELLER_API_KEY>
Content-Type: application/json
```

```json
{
  "breed": "Boerboel",
  "type": "Dog",
  "listing_type": "sale",
  "price": 150000,
  "age": "10 weeks",
  "location": "Lugbe, Abuja",
  "description": "3 males, 2 females. Parents on site.",
  "seller_name": "Ade",
  "whatsapp": "08031234567",
  "photos": ["https://…/photo1.jpg", "data:image/jpeg;base64,…"],
  "vaccinated": true,
  "dewormed": true,
  "pedigree": "pedigree"
}
```

| Field | Required | Notes |
|---|---|---|
| `breed` | yes | Max 80 characters. |
| `whatsapp` | yes | The number buyers will message. `0803…`, `+234 803…` and `+234 0803…` all become `+234803…`. |
| `photos` | yes | 1–6 items. Each is an `https://` URL or a `data:image/…;base64,` URI; JPEG, PNG, WebP, GIF or AVIF, max 8 MB. Photos are copied into PuppyPlace storage, so expiring WhatsApp media links are fine as long as they are still valid when sent. |
| `type` | no | `Dog` (default), `Cat`, `Bird`, `Rabbit`, `Fish`, `Guinea Pig`, `Reptile`, `Other`. |
| `listing_type` | no | `sale` (default) or `adoption`. Adoption listings drop the price. |
| `price` | no | Number in naira. Strings like `"₦150,000"` are accepted. |
| `age`, `location`, `description`, `seller_name`, `name` | no | Free text. |
| `vaccinated`, `dewormed` | no | `true` / `false`. |
| `pedigree` | no | `pedigree` or `non-pedigree`. |

## Responses

| Status | Body | Meaning |
|---|---|---|
| 201 | `{"ok":true,"status":"pending","id":"…","slug":"…","url":"https://puppyplace.ng/pets/…"}` | Saved; awaiting approval. The `url` works once approved. |
| 200 | `{"ok":true,"status":"pending","duplicate":true,…}` | The same number sent the same breed in the last 15 minutes; the existing pending listing is returned and nothing new is saved. |
| 400 | `{"error":"Invalid listing","details":["…"]}` | Tell the seller what to fix (each detail is a plain sentence). |
| 401 | `{"error":"Unauthorized"}` | Wrong or missing key. |
| 503 | `{"error":"Server not configured"}` | `SELLER_API_KEY` (or the Supabase keys) are not set. |

## Suggested bot behaviour

- Only answer people who want to sell or rehome a pet; send buyers to <https://puppyplace.ng/pets.html>.
- Collect breed, age, price (or "adoption"), city/area, vaccination and deworming status, and 2–6 photos, then confirm a summary with the seller before sending.
- On 201, tell the seller their listing is being reviewed and will appear on PuppyPlace once approved.

## Telling the seller it is live

Vendwyze remembers each listing it sends (the `slug` in the 201 response) and,
once a minute, asks this site which of the ones still waiting are live:

```
GET /api/seller-listings/status?slugs=boerboel-20261008-1019-ab12,lhasa-20261008-0950-cd34
Authorization: Bearer <SELLER_API_KEY>

200 { "live": ["boerboel-…"], "pending": ["lhasa-…"], "missing": [] }
```

`live` is approved and showing, `pending` is waiting for the store, `missing`
is no longer there (deleted). Up to 50 slugs, each letters, digits and hyphens.
Each seller whose listing is live gets, in the same WhatsApp chat they wrote
from, their link with a push to share it, and the link again in a message made
to be forwarded. Because Vendwyze asks, it does not matter how the listing was
approved (the ✅ in Admin → Pets, the edit form, the database), and this site
never has to reach Vendwyze.
