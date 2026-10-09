# Testing

## Platform (this project)

```bash
npm test          # vitest: embedded PostgreSQL (PGlite), no services needed
npm run typecheck
```

Covered: registration & POS enrollment (installation binding, single-use codes, revocation), menu sync (deactivation of removed items, default
vs product preparation time), table sync idempotency and token format, server-side pricing with flavors and option groups (min/max, foreign
options, unavailable products, missing flavor), idempotent submissions under concurrency, status ordering by sequence, service expiry / pause /
replaced QR / inactive table, geofence (radius, polygon, inaccurate, stale, missing location — enforced on the server), opening hours across
midnight, tenant isolation, QR codes decoded back to the exact URL (also at a quarter of the print size).

## POS (D:\PRO)

```bash
dotnet test tests/SupermarketPOS.Tests
```

`TableOrderingTests`: feature off = nothing active and no network; stable table identities; idempotent receipt; preparation estimate (max item,
product time over snapshot, default); preparation groups (join, push later, adjust, history kept); queue mode; settlement through the normal sale
(once, stock once, table freed, second payment refused); rejection; the synchronization worker against an in-memory platform (tables, menu,
orders, ack, outage → local work continues → recovery pushes the queued status, revoked device).

## End-to-end (real POS code ↔ real platform)

```bash
# 1. platform fixture + server (embedded DB in ./data-e2e)
cd D:\PRO-MENU
set DATA_DIR=./data-e2e
npm run e2e:setup                      # prints {"slug":"e2e-cafe","code":"XXXX-XXXX-XXXX"}
npx next dev -p 4317                   # keep running

# 2. POS end-to-end test against it
cd D:\PRO
set MENU_E2E_URL=http://localhost:4317
set MENU_E2E_CODE=XXXX-XXXX-XXXX
dotnet test tests/SupermarketPOS.Tests --filter TableOrderingEndToEndTests --logger "console;verbosity=detailed"
```

The test connects the POS with the code, syncs two tables and the menu, orders through the public API with the table's QR link (and retries the
same submission), receives it in the POS, accepts it, marks it ready and checks the customer's tracking API at each step, then downloads the QR card.

## Manual checks done in the browser

Mobile (375×812) Arabic RTL menu, product sheet (flavors, required/optional options, prep time, notes, quantity), cart totals, submission,
tracking page live update from "sent" → "accepted" (countdown kept across refresh) → "ready".
