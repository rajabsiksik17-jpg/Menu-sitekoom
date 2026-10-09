/**
 * End-to-end test fixture (development only): an active restaurant with no geofence and a fresh POS connection code.
 * Prints JSON {"slug","code"} for the POS end-to-end test. Run with DATA_DIR pointing at a throw-away folder,
 * BEFORE starting the server on the same folder (the embedded database is single-process).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (url?.startsWith("postgres") && !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("e2e-setup only runs on a local database (embedded, or PostgreSQL on this machine).");
  const { getDb } = await import("../src/db");
  const { restaurants } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const admin = await import("../src/server/admin");
  const db = await getDb();
  const actor = { type: "system" as const, id: "e2e", ip: "local" };
  const slug = process.env.E2E_SLUG ?? "e2e-cafe";
  const existing = (await admin.listRestaurants(db, slug, "", 1)).rows.find((r) => r.slug === slug);
  const r = existing ?? await admin.createRestaurant(db, { slug, nameAr: "مقهى الاختبار", nameEn: "E2E Cafe" }, actor);
  await admin.updateService(db, r.id, { status: "active", serviceExpiresAt: "", orderingPaused: false }, actor);
  // Each test run is a new POS installation: release the binding left by the previous run.
  await db.update(restaurants).set({ installationCode: null }).where(eq(restaurants.id, r.id));
  const { code } = await admin.createEnrollmentCode(db, r.id, actor);
  console.log(JSON.stringify({ slug, code }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
