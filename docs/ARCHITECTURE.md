# Architecture

```
 Customer phone ──HTTPS──►  menu platform (Next.js, one deployment, many restaurants)  ◄──HTTPS (outbound only)── POS main device
  /slug/t/token            ├─ public menu, order API, tracking API                         CloudSyncWorker (C#)
  /o/tracking-token          ├─ POS API /api/pos/v1/* (device bearer token)                  ├─ PUT tables / menu / images
                             ├─ platform dashboard /admin (owner)                            ├─ GET orders?wait=20 (long poll)
                             └─ PostgreSQL + image volume                                    ├─ POST orders/ack
                                                                                             └─ POST orders/status
```

## Two independent projects

| | Project A — POS (`D:\PRO`) | Project B — Menu platform (`D:\PRO-MENU`) |
|---|---|---|
| Runs | Windows, WinForms, .NET 9, SQLite, offline-first | Node 20+ server, Next.js 16, PostgreSQL |
| Source of truth for | products, prices, options, preparation times, tables, order acceptance/ETA, sales, payments, stock | restaurant accounts, service entitlement, branding, location/area, banners, public QR tokens, received orders |
| Deploys | Windows setup (unchanged) | Docker image; new versions never require a new POS build |

## POS integration points (minimal, isolated, off by default)

| Area | Change |
|---|---|
| Settings | `PosSettings.TableOrdering*` (enabled flag default **off**), platform URL, default prep time, acceptance, reject, sound, kitchen on accept, estimate mode, grouping, close on payment |
| Database | migration `0011_TableOrdering.sql`: `Products.PrepMinutes`, `Products.OnlineHidden`, tables `DiningTables`, `TableSessions`, `OnlineOrders`, `OnlineOrderEvents` (additive only) |
| Services | `TableOrdering/TableService`, `OnlineOrderService`, `CloudService`, `CloudSyncWorker`, `PrepEstimator` (registered in `ServiceRegistration`, exposed to LAN terminals through `LanProtocol`) |
| Sale | `CompleteSaleRequest.OnlineOrderIds` → `OnlineOrderService.LinkToSaleAsync` inside the existing sale transaction (normal validation, stock, payments, e-invoicing; an order can be paid only once) |
| UI | sidebar "الطاولات" (restaurant + enabled), `TablesPage`, QR preview/print, restaurant cashier header button "طلبات QR" + `OnlineOrdersForm`, product editor fields, settings section |
| Startup | `CloudSyncWorker.RunAsync` started next to the e-invoicing worker on the standalone / main device; idle (no network) unless enabled and connected |

When the feature is off: no new navigation, buttons, fields, timers or network traffic; supermarket mode never shows any of it.

## Identity & tenancy

- **Restaurant account** (`restaurants.id`, UUID) — owned by the platform; public identity is the `slug` (path segment), never the name.
- **POS installation** — the license *installation code* (`LicenseStatus.InstallationCode`). The account is bound to it at the first connection (or pre-set by the owner); later connections must match.
- **Device** (`pos_devices`) — created by enrollment with a one-time code (30 min, single use, stored hashed); authenticates with a 256-bit bearer token stored as SHA-256. A new enrollment revokes the previous device; the owner can revoke any time.
- **Service entitlement** — `status` (draft / active / suspended) + `service_expires_at` + `ordering_paused`; independent from the offline POS license (expiry never affects local selling).
- **Tables** — POS `DiningTables.Uid` (GUID) = platform `dining_tables.pos_uid`; the number is a label. The platform issues the public token (128-bit), idempotent per uid.
- Every restaurant-owned row carries `restaurant_id`; every query is scoped by the tenant obtained from authentication (device token, slug + table token, or admin session). There is no endpoint that takes a restaurant id from a customer.

## Synchronization

| Direction | What | How | Retry / duplicates |
|---|---|---|---|
| POS → platform | tables | `PUT /tables` (pending ones) | upsert by uid; failed → `SyncState=Failed` + reason, retried |
| POS → platform | menu | full snapshot when its SHA-256 changes (checked every 60 s), only online-visible active products; prices tax-inclusive | upsert by POS ids, missing ones deactivated; images by content hash, uploaded only when missing |
| platform → POS | orders | long poll `GET /orders?wait=20` | order stays `submitted` until the POS stored it and called `ack`; POS ignores ids it already has |
| POS → platform | status / ETA | outbox: `OnlineOrders.StatusSynced=0` + `StatusSeq` | platform applies only `seq > stored`; retried after outages |

Only the POS moves an order past *delivered*: the customer never sees *accepted* before a cashier accepted it.

## Data model (platform)

`platform_admins`, `admin_sessions`, `restaurants`, `pos_devices`, `enrollment_codes`, `media`, `categories`, `products`, `product_variants`,
`modifier_groups`, `modifier_options`, `product_modifier_groups`, `dining_tables`, `revoked_table_tokens`, `orders`, `order_items`
(price snapshots), `order_events` (status history), `promotions`, `audit_logs`, `sync_logs`. Schema in `src/db/schema.ts`, SQL in `drizzle/`.

## Real-time choices

- POS ← platform: long polling over HTTPS (works through any NAT/proxy, no inbound ports, resumes after outages; the database is the queue).
- Customer tracking: polling every 4 s with back-off (works on every phone/network; the countdown is computed from stored server timestamps, so refreshing never resets it).
- Cashier screens: local polling (4–5 s) + an in-process event when the worker stores new orders.
