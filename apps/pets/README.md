# PuppyPlace Pets (Android and iOS app)

The pets section of puppyplace.ng as a phone app, built with Expo (React Native).
One codebase makes both the Android and the iPhone app.

It uses the website's own API (`worker.js`). There is no separate backend or
database: listings, accounts, messages and photos are the same as on the site.

## What's in it

| Tab / screen | What it does | Site API |
|---|---|---|
| **Pets** | Every live pet, search (breed, city), filters (dogs, cats, birds, rabbits, fish, other; sale / adoption), pull to refresh | `GET /api/pets` |
| **Pet page** | Photos, price, details, description, share. **WhatsApp** opens a chat with the seller; **Message** writes to them in the app. On your own listing: mark as sold / available | `GET /api/contact`, `POST /api/me/sold` |
| **List a pet** | Photos (gallery or camera, up to 6), type, breed, sale or adoption, price, age, location, description, health. Saved **pending** until approved in Admin → Pets, as with the WhatsApp assistant | `POST /api/me/listing` (new) |
| **Messages** | Conversations as buyer or seller, unread badge, reply, report. Updates every 20 seconds while open | `/api/dm/*` |
| **Account** | WhatsApp sign in, my listings with status and views, mark sold, log out | `/api/auth/*`, `GET /api/me` |

Sign in is the website's: a WhatsApp number and a 6-digit code. The app keeps
the session token in the phone's secure storage (Keychain / Keystore) and sends
it as `Authorization: Bearer …`.

Changing price, photos or details of a listing still happens in **My listings**
on the website (the Account tab links there).

## Server changes this app needs (in `worker.js`)

Deploy the site before releasing the app.

- `POST /api/auth/verify` with `"app": true` also returns the session `token`.
- Every signed-in route accepts that token in an `Authorization: Bearer u1.…`
  header as well as the `pp_s` cookie.
- `POST /api/me/listing`: a signed-in seller lists a pet (same fields as
  `/api/seller-listings`; photos as `data:` URIs). Pending until approved, owned
  by the account's number, at most 5 a day per account. The admin alert
  (`SELLER_ALERT_WEBHOOK`) fires as for the WhatsApp assistant.

## Run it on your phone (development)

```bash
cd apps/pets
npm install
npx expo start
```

The app uses `expo-secure-store` and `expo-image-picker`, which Expo Go
includes, so you can scan the QR code with **Expo Go** (Android) or the Camera
app (iPhone). It talks to the live puppyplace.ng.

Checks: `npm run typecheck`.

## Build and publish

Builds run on Expo's servers (EAS), so no Mac is needed for the iPhone app.

1. Create a free account at expo.dev, then `npx eas-cli@latest login`.
2. `npx eas-cli@latest init` links the project (it adds the project id to `app.json`).
3. Test build to install directly on an Android phone:
   `npx eas-cli@latest build --platform android --profile preview` (gives an APK link).
4. Store builds: `npx eas-cli@latest build --platform all --profile production`.
5. Submit: `npx eas-cli@latest submit --platform android` and `--platform ios`.

You need:

- **Google Play**: a Play Console developer account (one-time $25). The first
  upload of the `.aab` may have to be done by hand in Play Console; after that
  `eas submit` works with a service-account key.
- **Apple App Store**: an Apple Developer Program membership ($99 a year). EAS
  creates the certificates; `eas submit` uploads to App Store Connect / TestFlight.
- For both stores: a privacy policy link (`https://puppyplace.ng/privacy.html`),
  screenshots and a short description. Apple also requires a way for users to
  delete their account. The site has no delete route yet, so add one (or a
  documented request process) before submitting to the App Store.

App ids: `ng.puppyplace.pets` (Android package and iOS bundle id). Change them
in `app.json` before the first store build if you want different ones. They
can't be changed after publishing.

## Icons

`assets/images/` has a placeholder orange paw icon and splash. Replace
`icon.png` (1024×1024), `android-icon-foreground.png` (paw/logo on transparent,
inside the middle 66%), `android-icon-background.png` and `splash-icon.png` with
the PuppyPlace logo before publishing.
