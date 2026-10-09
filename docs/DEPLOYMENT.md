# Deployment

> Hosted option (Supabase database + storage, site on Vercel): see [النشر-Supabase-Vercel.md](النشر-Supabase-Vercel.md).

## Recommended setup (one VPS, ~2 vCPU / 4 GB RAM is plenty for dozens of restaurants)

1. Point DNS: `menu.sitekoom.com` (A/AAAA) → the server.
2. Install Docker + the compose plugin.
3. Copy this folder to the server, then:
   ```bash
   cp .env.example .env      # set PUBLIC_BASE_URL, POSTGRES_PASSWORD, APP_SECRET (openssl rand -base64 48), MENU_DOMAIN
   docker compose up -d --build
   docker compose exec web node -e "process.exit(0)"   # container running
   ```
4. First administrator: put `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` (12+ characters) in `.env` before the first start — the server
   creates that account only while no administrator exists. Remove `ADMIN_PASSWORD` from `.env` afterwards and restart.
   More administrators / password resets: `npm run admin:create -- email "Name"` from a checkout with `DATABASE_URL` set (`ADMIN_PASSWORD` env).
5. Open `https://menu.sitekoom.com/admin`, create a restaurant, set it **active**, generate a **connection code**, enter it in the POS
   (Settings → Restaurant → Tables & QR ordering → Connect).

Caddy obtains and renews the HTTPS certificate automatically. Migrations run at start (`AUTO_MIGRATE=true`); for controlled upgrades set it to
`false` and run `npm run db:migrate` (with `DATABASE_URL`) before starting the new version. Migrations are additive.

## Without Docker

Node 20.9+, PostgreSQL 15+: `npm ci && npm run build`, then `node .next/standalone/server.js` with the environment of `.env.example`
(copy `.next/static` → `.next/standalone/.next/static`, `public` → `.next/standalone/public`, `drizzle` → next to `server.js`).
Put a reverse proxy with HTTPS in front (Caddy/nginx); keep `DATA_DIR` on persistent storage. QR card fonts are bundled (`assets/fonts`).

## Configuration

All deployment-specific values are environment variables — see `.env.example`. Changing `PUBLIC_BASE_URL` changes the QR links: reprint the cards
(or keep the old domain redirecting to the new one).

## Backups & recovery

- Database: daily `pg_dump`:
  ```bash
  docker compose exec -T db pg_dump -U menu -Fc menu > backup/menu-$(date +%F).dump
  ```
  Restore: `docker compose exec -T db pg_restore -U menu -d menu --clean < backup/menu-YYYY-MM-DD.dump`.
- Images: back up the `media` volume (`/data/media`). Images synced from POS devices are also re-uploaded automatically if missing.
- Data the POS owns (menu, tables, order decisions) is rebuilt by the POS: after a restore, pressing "Sync now" on the POS resends tables and the menu.
  Orders that customers placed after the last backup but before the failure are lost only if they had not reached a POS yet.

## Monitoring

- `GET /api/health` (database check) for the uptime monitor / container health check.
- Structured JSON logs on stdout (`docker compose logs web`); errors are logged with the request path.
- Dashboard: POS online/offline per restaurant, orders waiting for a POS, sync errors in the last 24 h, sync log, audit log.

## Scaling notes

The default is one web instance (in-memory rate limits and long-poll wake-ups). Several instances work correctly (state is in PostgreSQL; pollers
re-check the database every 5 s), but move rate limits to the proxy and expect up to 5 s extra delivery latency. Images can move to object storage by
replacing `src/lib/media.ts`.
