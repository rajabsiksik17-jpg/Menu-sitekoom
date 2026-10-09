import { count } from "drizzle-orm";
import { getDb } from "@/db";
import { platformAdmins } from "@/db/schema";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { createAdmin } from "./admins";

/**
 * Server start: opens the database (applying migrations when AUTO_MIGRATE is on) and, on a fresh installation, creates
 * the first platform administrator from ADMIN_EMAIL / ADMIN_PASSWORD (only when no administrator exists yet — the
 * variables can then be removed). Fails fast in production when APP_SECRET is missing.
 */
export async function bootstrap() {
  void env.appSecret; // throws in production without a proper secret
  // Serverless file systems are temporary: an embedded database there would silently lose data.
  if (process.env.VERCEL && !env.databaseUrl.startsWith("postgres")) throw new Error("DATABASE_URL (PostgreSQL, e.g. Supabase) must be set on Vercel.");
  if (process.env.VERCEL && !process.env.SUPABASE_URL) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Vercel (image storage).");
  const db = await getDb();
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const [{ n }] = (await db.select({ n: count() }).from(platformAdmins)) as [{ n: number }];
    if (n === 0) {
      await createAdmin(db, email, process.env.ADMIN_NAME ?? "Platform owner", password);
      log.info("bootstrap.admin_created", { email });
    }
  }
  log.info("bootstrap.ready", { publicUrl: env.publicUrl });
}

/** Startup entry: on misconfiguration (missing APP_SECRET, unreachable database…) stop the process so the supervisor restarts and alerts. */
export async function start() {
  try {
    await bootstrap();
  } catch (e) {
    log.error("bootstrap.failed", { error: e instanceof Error ? e.message : String(e) });
    process.exit(1);
  }
}
