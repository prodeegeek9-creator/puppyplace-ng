# Meta (Facebook and Instagram) ads for the Shop

Catalog ads, the swipeable product cards that show people products they looked
at, for the **Shop's products only**. Meta's catalogs don't allow live animals,
and its ad rules ban ads for pets sold by private sellers, so pets are never in
the feed. Advertising pets for sale this way would get the ads rejected and
could restrict the ad account.

## 1. The Pixel

1. In Meta Events Manager, create a Pixel (Data sources → Add → Web) and copy
   its ID (a long number).
2. Cloudflare → Workers → puppyplace-ng → Settings → Variables: add
   `META_PIXEL_ID` with that number, and deploy.

Every page then loads `/pp-pixel.js`, which sends:

| Event | When |
|---|---|
| PageView | every page |
| ViewContent | a product page |
| AddToCart, AddToWishlist | the cart and wishlist buttons |
| InitiateCheckout | checkout opens |
| Purchase | Paystack confirms the payment |

Product events carry the product's id, the same id the feed uses, so Meta can
match a visit to the product card. Without `META_PIXEL_ID` the script does
nothing. A browser that has opted out of the site's own tracking (`pp_notrack`)
sends nothing either.

## 2. The catalog feed

`https://puppyplace.ng/feeds/meta-shop.csv` lists every active Shop product
with a photo and a price, in Meta's columns: id, title, description,
availability, condition, price (and sale_price when there is an original
price), link, image_link, additional_image_link, brand and product_type.
Switched-off and out-of-stock products drop out by themselves.

In Meta Commerce Manager: Catalogue → Data sources → Add items → Data feed →
Scheduled feed, paste the address, and set it to update daily.

## 3. The ads

In Ads Manager, create a Sales campaign with the catalogue ("Advantage+
catalogue ads"), connect the Pixel, and choose the carousel format.
