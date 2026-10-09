import { eq, sql } from "drizzle-orm";
import { createMemoryDb, type Db } from "@/db";
import { restaurants } from "@/db/schema";
import { createEnrollmentCode, createRestaurant, updateService } from "@/server/admin";
import { enroll, authenticateDevice, syncMenu, syncTables } from "@/server/pos";
import type { MenuPayload } from "@/server/pos-schemas";
import { resetRateLimits } from "@/lib/rate-limit";

export const admin = { type: "admin" as const, id: "00000000-0000-0000-0000-000000000001", ip: "test" };

let shared: Db | undefined;

/** One embedded Postgres per test file, emptied before each test (a new instance per test exhausts WASM memory). */
export async function freshDb(): Promise<Db> {
  resetRateLimits();
  shared ??= await createMemoryDb();
  const rows = (await shared.execute(sql`select tablename from pg_tables where schemaname = 'public'`)) as unknown as { rows: { tablename: string }[] };
  const names = rows.rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await shared.execute(sql.raw(`truncate ${names} restart identity cascade`));
  return shared;
}

/** Restaurant A in Amman with an active service, a connected POS and the sample menu + 3 tables. */
export async function setupRestaurant(db: Db, slug = "burger-house", installation = "ABCD-1234") {
  const r = await createRestaurant(db, { slug, nameAr: "برجر هاوس", nameEn: "Burger House", installationCode: installation }, admin);
  await updateService(db, r.id, { status: "active", serviceExpiresAt: "", orderingPaused: false }, admin);
  const { code } = await createEnrollmentCode(db, r.id, admin);
  const enrolled = await enroll(db, { code, installationCode: installation, deviceName: "Main POS", appVersion: "1.0" }, "1.2.3.4");
  const device = await authenticateDevice(db, `Bearer ${enrolled.token}`, "1.2.3.4");
  await syncMenu(db, device, sampleMenu());
  const tables = await syncTables(db, device, [1, 2, 3].map((n) => ({ uid: uid(n, slug), number: n, name: null, seats: 4, status: "active" })));
  const [row] = await db.select().from(restaurants).where(eq(restaurants.id, r.id));
  return { restaurant: row!, device, token: enrolled.token, tables: tables.tables };
}

export function uid(n: number, salt = "") {
  const hex = Buffer.from(`${salt}:${n}`).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function sampleMenu(): MenuPayload {
  return {
    hash: "h1",
    currency: { code: "JOD", symbol: "د.أ", decimals: 3 },
    defaultPrepMinutes: 15,
    requireAcceptance: true,
    categories: [
      { id: 1, name: "برجر", sort: 0, icon: "🍔", color: "#C2410C", image: null, active: true },
      { id: 2, name: "مشروبات", sort: 1, icon: "🥤", color: null, image: null, active: true },
    ],
    products: [
      { id: 10, unitId: 100, categoryId: 1, nameAr: "برجر لحم", nameEn: "Beef Burger", description: "لحم بقري 150غ", price: 3.5, image: null, prepMinutes: 25, available: true, sort: 0, variants: [], groups: [1, 2] },
      { id: 11, unitId: 110, categoryId: 1, nameAr: "برجر دجاج", nameEn: null, description: null, price: 3, image: null, prepMinutes: null, available: true, sort: 1, variants: [], groups: [2] },
      { id: 12, unitId: 120, categoryId: 2, nameAr: "عصير", nameEn: "Juice", description: null, price: 1.25, image: null, prepMinutes: 5, available: true, sort: 0,
        variants: [{ id: 501, name: "برتقال", price: null, image: null, sort: 0 }, { id: 502, name: "مانجا", price: 1.5, image: null, sort: 1 }], groups: [] },
      { id: 13, unitId: 130, categoryId: 2, nameAr: "ماء", nameEn: "Water", description: null, price: 0.35, image: null, prepMinutes: 1, available: false, sort: 1, variants: [], groups: [] },
    ],
    modifierGroups: [
      { id: 1, name: "الحجم", min: 1, max: 1, sort: 0, options: [{ id: 1001, name: "عادي", price: 0, isDefault: true, sort: 0 }, { id: 1002, name: "دبل", price: 1.25, isDefault: false, sort: 1 }] },
      { id: 2, name: "إضافات", min: 0, max: 3, sort: 1, options: [{ id: 2001, name: "جبنة", price: 0.25, isDefault: false, sort: 0 }, { id: 2002, name: "بصل", price: 0, isDefault: false, sort: 1 }] },
    ],
  };
}

export const AMMAN = { lat: 31.9539, lng: 35.9106 };
