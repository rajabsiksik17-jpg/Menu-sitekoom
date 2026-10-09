/**
 * Applies database migrations (drizzle/*.sql) to DATABASE_URL — run once per deployment before starting the new
 * version (the server can also do it at start with AUTO_MIGRATE=true). Safe to run repeatedly.
 */

async function main() {
  const url = process.env.DATABASE_URL;
  if (url?.startsWith("postgres")) {
    const { Pool } = await import("pg");
    const { pgConfig, migrateLocked } = await import("../src/db");
    const pool = new Pool(pgConfig(url));
    await migrateLocked(pool);
    await pool.end();
    console.log("Migrations applied (PostgreSQL).");
  } else {
    const { getDb } = await import("../src/db");
    await getDb(); // opens the embedded database and migrates it
    console.log("Migrations applied (embedded PGlite).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
