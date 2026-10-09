import path from "node:path";

/**
 * Runtime configuration (read on the server only; never inlined into the browser bundle).
 * Nothing deployment-specific is hard-coded: the public domain, database and secrets all come from the environment.
 */
function bool(v: string | undefined, d: boolean) {
  return v === undefined || v === "" ? d : ["1", "true", "yes"].includes(v.toLowerCase());
}

function int(v: string | undefined, d: number) {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : d;
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  /** Public origin used in QR links, e.g. https://menu.sitekoom.com (no trailing slash). */
  get publicUrl() {
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return (process.env.PUBLIC_BASE_URL || (vercel ? `https://${vercel}` : "http://localhost:3100")).replace(/\/+$/, "");
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  /** Small on serverless hosting (each instance has its own pool; use the provider's connection pooler). */
  get dbPoolSize() {
    return int(process.env.DB_POOL_SIZE, process.env.VERCEL ? 3 : 10);
  },
  get autoMigrate() {
    return bool(process.env.AUTO_MIGRATE, true);
  },
  /** Uploaded images and the embedded development database. */
  get dataDir() {
    return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data"));
  },
  /** HMAC key for short-lived signed values (≥ 32 random bytes). Required in production. */
  get appSecret() {
    const s = process.env.APP_SECRET ?? "";
    if (s.length >= 32) return s;
    if (isProd) throw new Error("APP_SECRET must be set (at least 32 characters) in production.");
    return "development-only-secret-do-not-use-in-production!!";
  },
  /** Secure cookies (HTTPS). Off only for local http development. */
  get secureCookies() {
    return bool(process.env.SECURE_COOKIES, isProd);
  },
  /** Trust X-Forwarded-For from the reverse proxy (Caddy/nginx) for client IPs. */
  get trustProxy() {
    return bool(process.env.TRUST_PROXY, isProd || !!process.env.VERCEL);
  },
};
