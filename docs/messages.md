# Buyer sign in and messages

Buyers now sign in before they contact a seller. Signing in takes a WhatsApp
number and a 6-digit code sent to it (the same sign in sellers use for My
listings). There is no password.

## What a buyer sees on a pet page

- **Contact on WhatsApp**: the first time, a sign-in box opens (number, then
  code and first name). After that the WhatsApp chat with the seller opens
  straight away, with the usual "Hi, I'm interested in…" message filled in.
- **Send a message**: the buyer writes the message on the site. If they aren't
  signed in yet, they sign in when they press Send. The seller gets a WhatsApp
  message from the store's number with the text and a one-tap link to reply.
  When the seller replies, the buyer is told the same way. Neither sees the
  other's number.

The seller's number is no longer in the pet page. The Contact buttons on the
home page cards go to the pet's page and open the same flow.

## Messages page

`/messages.html` lists every conversation for the signed-in number, as a buyer
or as a seller, with unread counts. A conversation page shows the messages, a
reply box, a safety reminder, and a Report button. It checks for new messages
every 20 seconds while it is open.

Only the first unread message sends a WhatsApp alert. Later messages wait until
the other side opens the conversation, so a busy chat doesn't flood anyone's
WhatsApp.

## Who counts as the seller

The number the listing came from on WhatsApp (`pet_owners`), or the number
shown to buyers on the listing. Either one can read and answer. Listings added
in the admin with the store's number go to the store.

## Safety

- A message that mentions a deposit, transfer, bank or account number, or a
  10-digit number (a Nigerian account number) is flagged. The buyer sees a
  warning, and the conversation is marked in the admin.
- Either side can report a conversation. The store owner gets a WhatsApp alert,
  and it goes to the top of **Admin → Messages**.
- Limits: 30 messages an hour per person, 10 new conversations a day per buyer,
  30 WhatsApp chat openings an hour, messages up to 1,000 characters.

## Admin → Messages

All conversations, reported ones first, then flagged ones. Search by breed,
name or number. Open one to read it, and WhatsApp the buyer or the seller.

## Setup

Run `supabase/messages.sql` once in Supabase → SQL Editor (after
`seller_accounts.sql`). Until then, sending a message shows "Messages are not
set up yet". The WhatsApp button keeps working either way.

## Numbers stay private

The home page gets pets from the site's own server (`/api/pets`), which leaves
the sellers' numbers out, and the admin reads and changes pets through the
server with its log-in (`/api/admin/pets`). `supabase/private_pets.sql` then
closes the pets table to the public key, so nobody can read a number (or change
a listing) from the browser. Run it once the new version is live.

## Message icon

Every page with a wishlist icon (home, shop, pet pages, pet listings, product
pages) has a message icon next to it that opens `/messages.html`. In a browser
that has signed in, it shows how many conversations have something new
(`/api/dm/unread`). Other visitors' browsers never ask, so it costs nothing.
