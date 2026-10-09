import "server-only";
import path from "node:path";
import fs from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

type Holder = { db?: Promise<Db>; override?: Db };
const g = globalThis as unknown as { __menuDb?: Holder };
const holder: Holder = (g.__menuDb ??= {});

const migrationsFolder = path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

/**
 * Production: PostgreSQL through DATABASE_URL (node-postgres pool).
 * Development without a server: an embedded PGlite database (real Postgres compiled to WASM) under DATA_DIR/pglite.
 * Migrations run once per process unless AUTO_MIGRATE=false (then run `npm run db:migrate` during deployment).
 */
export function getDb(): Promise<Db> {
  if (holder.override) return Promise.resolve(holder.override);
  holder.db ??= open().catch((e) => {
    holder.db = undefined;
    throw e;
  });
  return holder.db;
}

async function open(): Promise<Db> {
  const url = env.databaseUrl;
  if (url && url.startsWith("postgres")) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool(pgConfig(url));
    pool.on("error", (e) => log.error("db.pool", { error: e.message }));
    const db = drizzle(pool, { schema }) as unknown as Db;
    if (env.autoMigrate) await migrateLocked(pool);
    log.info("db.open", { driver: "postgres" });
    return db;
  }
  const dir = path.join(/*turbopackIgnore: true*/ env.dataDir, "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(dir);
  const db = drizzle(client, { schema }) as unknown as Db;
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(drizzle(client), { migrationsFolder });
  log.info("db.open", { driver: "pglite", dir });
  return db;
}

/**
 * node-postgres settings. Supabase (and most hosted Postgres) require TLS: DB_SSL=true verifies the certificate,
 * DB_SSL=no-verify encrypts without verifying the provider's CA (Supabase's pooler default). The connection-string
 * "sslmode" is removed so these settings apply as written.
 */
export function pgConfig(url: string) {
  const u = new URL(url);
  const mode = (process.env.DB_SSL ?? (u.hostname.endsWith(".supabase.co") || u.hostname.endsWith(".supabase.com") ? "no-verify" : "false")).toLowerCase();
  u.searchParams.delete("sslmode");
  return {
    connectionString: u.toString(),
    max: env.dbPoolSize,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: mode === "true" || mode === "require" || mode === "verify" ? { rejectUnauthorized: true } : mode === "no-verify" ? { rejectUnauthorized: false } : undefined,
  };
}

/** Migrations under a Postgres advisory lock: several server instances starting together apply them exactly once. */
export async function migrateLocked(pool: import("pg").Pool) {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(727274101)");
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.query("select pg_advisory_unlock(727274101)").catch(() => undefined);
    client.release();
  }
}

/** Tests: use an in-memory database for this process. */
export function setDbForTests(db: Db | undefined) {
  holder.override = db;
}

export async function createMemoryDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder });
  return drizzle(client, { schema }) as unknown as Db;
}
