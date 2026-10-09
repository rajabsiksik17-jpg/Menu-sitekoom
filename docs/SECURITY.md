# Security

## Trust boundaries

| Caller | Authenticated by | Can reach |
|---|---|---|
| Customer browser | nothing secret — the restaurant slug + the table's QR token | public menu of that restaurant; create orders for that table; read the one order whose tracking token it holds |
| POS device | 256-bit bearer token (stored SHA-256 on the platform, DPAPI-encrypted on the POS) | only its restaurant's tables, menu, images, orders |
| Platform administrator | scrypt password + HttpOnly/SameSite=Lax/Secure session cookie (token stored SHA-256, 12 h) | dashboard |

No customer request carries a restaurant id; the tenant is always derived from the authenticated credential. Tests cover cross-tenant access
(device B cannot read/ack/update orders of A, A's table token does not work on B's menu, B cannot rotate A's tables).

## Orders

- Prices, totals, preparation times, availability, flavor and option rules (min/max per group) are computed on the server from the synchronized POS
  menu. Browser prices are never used. Quantity 1–50 per line, at most 40 lines, notes length-limited.
- Idempotency key per cart (kept until success): retries and double taps return the same order (unique index per restaurant).
- Rate limits: order submission per IP and per table, location checks, tracking polls, enrollment and login attempts (in-process token buckets — put
  the same limits in the reverse proxy if you run several instances).
- Tracking links use a 192-bit token and expose only that order's customer-facing fields.

## QR tokens

128-bit random, URL-safe; unique; no internal ids or credentials in the QR. Rotation invalidates the old token immediately (kept as "replaced" to explain
it to customers, never accepted). Deactivated / archived tables and suspended restaurants refuse orders.

## Location restriction (geofence) — what it guarantees and what it does not

Implemented: the restaurant's point + radius, or a polygon, and a maximum accuracy. The browser asks for one fresh high-accuracy reading **when the
order is sent** (not just when the page opens). The server re-checks every submission: inside the area, accuracy ≤ maximum, reading at most 2 minutes
old. Missing, denied, inaccurate, stale or outside → the order is refused with a clear message; browsing stays possible. The check endpoint returns
only a verdict and distance, never the area.

Limits (by design of web browsers): coordinates come from the customer's device and can be faked (developer tools, mock-location apps, scripts
calling the API directly). GPS indoors can be off by tens of metres — set the radius and maximum accuracy accordingly (defaults 80 m / 100 m).
So the geofence stops casual remote ordering (someone at home with a photo of a QR), not a determined attacker. Stronger options, if ever needed:
rotating the table QR regularly; a short code shown by staff; or a restaurant-Wi-Fi check — each adds friction and is not enabled by default. In all
cases the cashier still accepts each order (setting on by default), which is the final safeguard.

## Platform administration

Separate from restaurant staff (restaurants have no dashboard logins in this version). Passwords: scrypt (N=16384), constant-time verification,
timing-equalized unknown e-mails, login rate limits, audit of logins and failures. Server Actions are protected by Next.js origin checks; JSON
endpoints used from browsers check `Origin`. Uploads: decoded and re-encoded by sharp (any non-image refused, metadata stripped), 8 MB limit.

## Secrets

`APP_SECRET`, `DATABASE_URL`, map/geocoder keys live in environment variables (server only). Nothing secret is sent to the browser or stored in QR codes.
The POS never receives platform secrets other than its own device token. No vendor license key is involved.

## Headers

`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (geolocation self only), HSTS; Caddy terminates TLS.
