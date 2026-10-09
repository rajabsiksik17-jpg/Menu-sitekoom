# POS-SITEKOOM Menu — QR menus & table ordering (multi-restaurant)

A separate, independently deployable web platform that gives every restaurant using the POS-SITEKOOM desktop POS:

- a professional mobile-first public menu (Arabic RTL / English LTR) under one domain: `https://menu.example.com/<restaurant>`
- a secure QR code per table (`/<restaurant>/t/<secret-table-token>`), ordering from the table, live order tracking with a countdown
- delivery of orders to the restaurant's POS (outbound long-poll from the POS — no port forwarding), and the cashier's decisions back to the customer
- a platform-owner dashboard: restaurants, POS connections, service activation, branding, location & ordering area (map), opening hours, tables & QR printing, menu presentation, banners, orders, sync and audit logs

The POS stays offline-first: selling, kitchen, tables and orders already received never depend on this platform.

| | |
|---|---|
| Stack | Next.js 16 (App Router, React 19, TypeScript), Tailwind CSS 4, Drizzle ORM |
| Database | PostgreSQL (production) · PGlite embedded Postgres (development & tests, no install) |
| Images | WebP via sharp, on a persistent volume (`DATA_DIR`) |
| Maps | Leaflet + OpenStreetMap-compatible tiles, server-proxied geocoding |
| Deploy | One Docker image + PostgreSQL + Caddy (HTTPS) — `docker compose up -d` |

## Quick start (development, Windows)

```bash
npm install
npm run seed:demo        # demo restaurant + admin (admin@sitekoom.local / ChangeMe-12345) in ./data
npm run dev              # http://localhost:3100   (or scripts\dev-local.cmd → port 4317, ./data-dev)
npm test                 # backend tests (embedded Postgres)
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, data model, POS integration, synchronization
- [docs/TABLE-ORDERING.md](docs/TABLE-ORDERING.md) — business rules: order lifecycle, preparation times, groups, tables, settlement
- [docs/SECURITY.md](docs/SECURITY.md) — threat model, tenant isolation, tokens, geofence guarantees and limits
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production setup, backups, monitoring, recovery
- [docs/النشر-Supabase-Vercel.md](docs/النشر-Supabase-Vercel.md) — دليل النشر على Supabase + Vercel خطوة بخطوة
- [docs/TESTING.md](docs/TESTING.md) — automated tests and the POS ↔ platform end-to-end run

POS side (separate repository folder `D:\PRO`): `src/SupermarketPOS.Application/TableOrdering/*`, migration `0011_TableOrdering.sql`,
UI `Pages/TablesPage.cs`, `Pos/OnlineOrdersForm.cs`, settings → Restaurant → "الطاولات والطلب عبر QR".
