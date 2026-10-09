import "server-only";
import { and, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  auditLogs, categories, diningTables, enrollmentCodes, orderEvents, orderItems, orders, posDevices, products, promotions, restaurants, syncLogs,
  type Theme,
} from "@/db/schema";
import { randomCode, sha256 } from "@/lib/crypto";
import { AppError, notFound } from "@/lib/errors";
import { areaReady, validLat, validLng, validPolygon } from "@/lib/geo";
import { audit, type Actor } from "@/lib/audit";
import { DEFAULT_THEME } from "./menu";
import { serviceState } from "./entitlement";
import { tableUrl, rotateTable } from "./pos";
import { zonedToUtc } from "@/lib/time";

// ── Restaurants ────────────────────────────────────────────────────────────

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const restaurantSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "slug"),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(120).optional().transform((v) => v || null),
  descriptionAr: z.string().trim().max(500).optional().transform((v) => v || null),
  descriptionEn: z.string().trim().max(500).optional().transform((v) => v || null),
  phone: z.string().trim().max(30).optional().transform((v) => v || null),
  whatsapp: z.string().trim().max(30).optional().transform((v) => v || null),
  address: z.string().trim().max(200).optional().transform((v) => v || null),
  licenseCustomer: z.string().trim().max(120).optional().transform((v) => v || null),
  installationCode: z.string().trim().toUpperCase().max(64).optional().transform((v) => v || null),
  showContact: z.boolean().default(true),
  defaultLang: z.enum(["ar", "en"]).default("ar"),
  languages: z.array(z.enum(["ar", "en"])).min(1).default(["ar", "en"]),
  timezone: z.string().trim().max(60).default("Asia/Amman"),
  // Table sessions: final invoice display time after closing (0–1440 min) and automatic close after inactivity (30–1440 min).
  invoiceVisibleMinutes: z.coerce.number().int().min(0).max(1440).default(15),
  sessionIdleMinutes: z.coerce.number().int().min(30).max(1440).default(240),
});
export type RestaurantInput = z.input<typeof restaurantSchema>;

// First path segment of public menus (menu.example.com/<slug>): never one of the platform's own routes.
export const RESERVED_SLUGS = new Set(["admin", "api", "media", "o", "r", "t", "static", "_next", "login", "logout", "health", "favicon.ico",
  "robots.txt", "sitemap.xml", "manifest.json", "public", "assets", "www", "app", "menu"]);

export async function createRestaurant(db: Db, input: RestaurantInput, actor: Actor) {
  const v = restaurantSchema.parse(input);
  if (RESERVED_SLUGS.has(v.slug)) throw new AppError("slug_reserved");
  const [dup] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.slug, v.slug)).limit(1);
  if (dup) throw new AppError("slug_taken", 409);
  const [r] = await db.insert(restaurants).values({ ...v, theme: DEFAULT_THEME, status: "draft" }).returning();
  await audit(db, r!.id, actor, "restaurant.created", { slug: v.slug, name: v.nameAr });
  return r!;
}

export async function updateRestaurant(db: Db, id: string, input: RestaurantInput, actor: Actor) {
  const v = restaurantSchema.parse(input);
  if (RESERVED_SLUGS.has(v.slug)) throw new AppError("slug_reserved");
  const [dup] = await db.select({ id: restaurants.id }).from(restaurants).where(and(eq(restaurants.slug, v.slug), sql`${restaurants.id} <> ${id}`)).limit(1);
  if (dup) throw new AppError("slug_taken", 409);
  const [before] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  if (!before) throw notFound();
  await db.update(restaurants).set({ ...v, updatedAt: new Date() }).where(eq(restaurants.id, id));
  await audit(db, id, actor, "restaurant.updated", { slug: v.slug, slugChanged: before.slug !== v.slug, installationChanged: before.installationCode !== v.installationCode });
}

export const serviceSchema = z.object({
  status: z.enum(["draft", "active", "suspended"]),
  serviceExpiresAt: z.string().trim().optional().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "date"),
  orderingPaused: z.boolean(),
});

export async function updateService(db: Db, id: string, input: z.input<typeof serviceSchema>, actor: Actor) {
  const v = serviceSchema.parse(input);
  const [r] = await db.select({ tz: restaurants.timezone }).from(restaurants).where(eq(restaurants.id, id)).limit(1);
  if (!r) throw notFound();
  // "Valid through this date": the service ends at the end of that day in the restaurant's time zone.
  const end = v.serviceExpiresAt ? zonedToUtc(`${v.serviceExpiresAt}T23:59:59`, r.tz) : null;
  await db.update(restaurants).set({ status: v.status, orderingPaused: v.orderingPaused, serviceExpiresAt: end, updatedAt: new Date() }).where(eq(restaurants.id, id));
  await audit(db, id, actor, "restaurant.service_updated", { status: v.status, expiresAt: end?.toISOString() ?? null, paused: v.orderingPaused });
}

export const themeSchema = z.object({
  primary: hex, secondary: hex,
  background: z.enum(["light", "warm", "dark"]), buttonStyle: z.enum(["rounded", "pill", "square"]),
  cardStyle: z.enum(["elevated", "flat", "outline"]), layout: z.enum(["grid", "list"]),
});

export async function updateBranding(db: Db, id: string, theme: Theme, media: { logo?: string | null; cover?: string | null }, actor: Actor) {
  const t = themeSchema.parse(theme);
  const set: Partial<typeof restaurants.$inferInsert> = { theme: t, updatedAt: new Date() };
  if (media.logo !== undefined) set.logoMediaId = media.logo;
  if (media.cover !== undefined) set.coverMediaId = media.cover;
  await db.update(restaurants).set(set).where(eq(restaurants.id, id));
  await audit(db, id, actor, "restaurant.branding_updated", { theme: t, logo: media.logo !== undefined, cover: media.cover !== undefined });
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const hoursSchema = z.array(z.object({ day: z.number().int().min(0).max(6), open: hhmm, close: hhmm })).max(21);

export async function updateHours(db: Db, id: string, hours: z.input<typeof hoursSchema>, actor: Actor) {
  const h = hoursSchema.parse(hours);
  await db.update(restaurants).set({ openingHours: h.length ? h : null, updatedAt: new Date() }).where(eq(restaurants.id, id));
  await audit(db, id, actor, "restaurant.hours_updated", { entries: h.length });
}

export const geoSchema = z.object({
  geoEnabled: z.boolean(),
  lat: z.number().nullable(), lng: z.number().nullable(),
  geoMode: z.enum(["radius", "polygon"]),
  radiusM: z.number().int().min(10).max(5000),
  polygon: z.array(z.tuple([z.number(), z.number()])).max(200).nullable(),
  maxAccuracyM: z.number().int().min(10).max(1000),
});

/** Location and permitted ordering area. Enabling requires a valid area (a point with a radius, or a polygon). */
export async function updateGeo(db: Db, id: string, input: z.input<typeof geoSchema>, actor: Actor) {
  const g = geoSchema.parse(input);
  if (g.lat !== null && !validLat(g.lat)) throw new AppError("geo_invalid_point");
  if (g.lng !== null && !validLng(g.lng)) throw new AppError("geo_invalid_point");
  if (g.polygon && !validPolygon(g.polygon)) throw new AppError("geo_invalid_polygon");
  if (g.geoEnabled && !areaReady({ mode: g.geoMode, lat: g.lat, lng: g.lng, radiusM: g.radiusM, polygon: g.polygon, maxAccuracyM: g.maxAccuracyM }))
    throw new AppError("geo_incomplete");
  await db.update(restaurants).set({ ...g, updatedAt: new Date() }).where(eq(restaurants.id, id));
  await audit(db, id, actor, "restaurant.geo_updated", { enabled: g.geoEnabled, mode: g.geoMode, radiusM: g.radiusM, points: g.polygon?.length ?? 0, maxAccuracyM: g.maxAccuracyM });
}

// ── POS connection ─────────────────────────────────────────────────────────

/** One-time connection code for the POS (valid 30 minutes, stored hashed; shown once). */
export async function createEnrollmentCode(db: Db, restaurantId: string, actor: Actor) {
  const [r] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) throw notFound();
  const code = randomCode(3, 4);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await db.update(enrollmentCodes).set({ expiresAt: new Date() }).where(and(eq(enrollmentCodes.restaurantId, restaurantId), isNull(enrollmentCodes.usedAt)));
  const createdBy = actor.id && /^[0-9a-f-]{36}$/.test(actor.id) ? actor.id : null;
  await db.insert(enrollmentCodes).values({ restaurantId, codeHash: sha256(code), expiresAt, createdBy });
  await audit(db, restaurantId, actor, "pos.enrollment_code_created", { expiresAt: expiresAt.toISOString() });
  return { code, expiresAt };
}

export async function revokeDevice(db: Db, restaurantId: string, deviceId: string, actor: Actor) {
  const res = await db.update(posDevices).set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(posDevices.id, deviceId), eq(posDevices.restaurantId, restaurantId))).returning({ id: posDevices.id });
  if (!res.length) throw notFound();
  await audit(db, restaurantId, actor, "pos.device_revoked", { deviceId });
}

// ── Read models for the dashboard ──────────────────────────────────────────

export async function listRestaurants(db: Db, q: string, status: string, page: number, pageSize = 20) {
  const where = and(
    q ? or(ilike(restaurants.nameAr, `%${q}%`), ilike(restaurants.nameEn, `%${q}%`), ilike(restaurants.slug, `%${q}%`)) : undefined,
    status ? eq(restaurants.status, status) : undefined,
  );
  const [{ total }] = (await db.select({ total: count() }).from(restaurants).where(where)) as [{ total: number }];
  const rows = await db.select().from(restaurants).where(where).orderBy(desc(restaurants.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
  return { total, rows: rows.map((r) => ({ ...r, service: serviceState(r) })) };
}

export async function getRestaurant(db: Db, id: string) {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  return r ?? null;
}

export async function restaurantOverview(db: Db, id: string) {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [devices, [tables], [prods], [cats], ordersByStatus, [today], recentSync] = await Promise.all([
    db.select().from(posDevices).where(eq(posDevices.restaurantId, id)).orderBy(desc(posDevices.createdAt)),
    db.select({ n: count() }).from(diningTables).where(and(eq(diningTables.restaurantId, id), eq(diningTables.status, "active"))),
    db.select({ n: count() }).from(products).where(and(eq(products.restaurantId, id), eq(products.isActive, true))),
    db.select({ n: count() }).from(categories).where(and(eq(categories.restaurantId, id), eq(categories.isActive, true))),
    db.select({ status: orders.status, n: count() }).from(orders).where(and(eq(orders.restaurantId, id), inArray(orders.status, ["submitted", "delivered", "accepted", "preparing", "ready"]))).groupBy(orders.status),
    db.select({ n: count(), total: sql<number>`coalesce(sum(${orders.total}), 0)` }).from(orders).where(and(eq(orders.restaurantId, id), gte(orders.submittedAt, since))),
    db.select().from(syncLogs).where(eq(syncLogs.restaurantId, id)).orderBy(desc(syncLogs.at)).limit(8),
  ]);
  return { devices, tables: tables!.n, products: prods!.n, categories: cats!.n, ordersByStatus, today: today!, recentSync };
}

export async function platformStats(db: Db) {
  const since = new Date(Date.now() - 24 * 3600_000);
  const online = new Date(Date.now() - 2 * 60_000);
  const [[rest], [active], [connected], [ord], [waiting], [errors]] = await Promise.all([
    db.select({ n: count() }).from(restaurants),
    db.select({ n: count() }).from(restaurants).where(eq(restaurants.status, "active")),
    db.select({ n: count() }).from(restaurants).where(gte(restaurants.posLastSeenAt, online)),
    db.select({ n: count() }).from(orders).where(gte(orders.submittedAt, since)),
    db.select({ n: count() }).from(orders).where(eq(orders.status, "submitted")),
    db.select({ n: count() }).from(syncLogs).where(and(eq(syncLogs.ok, false), gte(syncLogs.at, since))),
  ]);
  return { restaurants: rest!.n, active: active!.n, connected: connected!.n, orders24h: ord!.n, waitingForPos: waiting!.n, syncErrors24h: errors!.n };
}

export async function listTables(db: Db, restaurantId: string) {
  const [r] = await db.select({ slug: restaurants.slug }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) return [];
  const rows = await db.select().from(diningTables).where(eq(diningTables.restaurantId, restaurantId)).orderBy(diningTables.number);
  return rows.map((t) => ({ ...t, url: tableUrl(r.slug, t.token) }));
}

export async function adminRotateTable(db: Db, restaurantId: string, uid: string, actor: Actor) {
  return rotateTable(db, restaurantId, uid, { type: "admin", id: actor.id ?? "", ip: actor.ip ?? "" });
}

export async function listOrders(db: Db, filter: { restaurantId?: string; status?: string; q?: string; page: number; pageSize?: number }) {
  const pageSize = filter.pageSize ?? 25;
  const where = and(
    filter.restaurantId ? eq(orders.restaurantId, filter.restaurantId) : undefined,
    filter.status ? eq(orders.status, filter.status) : undefined,
    filter.q && /^\d+$/.test(filter.q) ? or(eq(orders.number, Number(filter.q)), eq(orders.tableNumber, Number(filter.q))) : undefined,
  );
  const [{ total }] = (await db.select({ total: count() }).from(orders).where(where)) as [{ total: number }];
  const rows = await db.select({ o: orders, slug: restaurants.slug, name: restaurants.nameAr }).from(orders)
    .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).where(where)
    .orderBy(desc(orders.submittedAt)).limit(pageSize).offset((filter.page - 1) * pageSize);
  return { total, rows };
}

export async function getOrder(db: Db, id: string) {
  const [row] = await db.select({ o: orders, r: restaurants }).from(orders).innerJoin(restaurants, eq(restaurants.id, orders.restaurantId)).where(eq(orders.id, id)).limit(1);
  if (!row) return null;
  const [items, events] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(orderItems.id),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(orderEvents.at, orderEvents.id),
  ]);
  return { ...row, items, events };
}

export async function listSyncLogs(db: Db, restaurantId: string | undefined, onlyErrors: boolean, page: number) {
  const where = and(restaurantId ? eq(syncLogs.restaurantId, restaurantId) : undefined, onlyErrors ? eq(syncLogs.ok, false) : undefined);
  const rows = await db.select({ l: syncLogs, name: restaurants.nameAr }).from(syncLogs).leftJoin(restaurants, eq(restaurants.id, syncLogs.restaurantId))
    .where(where).orderBy(desc(syncLogs.at)).limit(50).offset((page - 1) * 50);
  return rows;
}

export async function listAudit(db: Db, restaurantId: string | undefined, page: number) {
  return db.select({ a: auditLogs, name: restaurants.nameAr }).from(auditLogs).leftJoin(restaurants, eq(restaurants.id, auditLogs.restaurantId))
    .where(restaurantId ? eq(auditLogs.restaurantId, restaurantId) : undefined).orderBy(desc(auditLogs.at)).limit(50).offset((page - 1) * 50);
}

export async function listMenu(db: Db, restaurantId: string) {
  const [cats, prods] = await Promise.all([
    db.select().from(categories).where(eq(categories.restaurantId, restaurantId)).orderBy(categories.sort),
    db.select().from(products).where(eq(products.restaurantId, restaurantId)).orderBy(products.sort, products.nameAr),
  ]);
  return { cats, prods };
}

export const presentationSchema = z.object({
  isFeatured: z.boolean(), isNew: z.boolean(),
  labelAr: z.string().trim().max(30).optional().transform((v) => v || null),
  labelEn: z.string().trim().max(30).optional().transform((v) => v || null),
});

/** Featured / new / label: presentation set in the dashboard; prices and availability stay with the POS. */
export async function updatePresentation(db: Db, restaurantId: string, productPosId: number, input: z.input<typeof presentationSchema>, actor: Actor) {
  const v = presentationSchema.parse(input);
  const res = await db.update(products).set(v).where(and(eq(products.restaurantId, restaurantId), eq(products.posId, productPosId))).returning({ id: products.id });
  if (!res.length) throw notFound();
  await audit(db, restaurantId, actor, "product.presentation_updated", { productPosId, ...v });
}

// ── Promotions ─────────────────────────────────────────────────────────────

const optDate = z.string().trim().optional().transform((v) => v || null).refine((v) => v === null || /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(v), "date");
export const promotionSchema = z.object({
  titleAr: z.string().trim().max(80).optional().transform((v) => v || null),
  titleEn: z.string().trim().max(80).optional().transform((v) => v || null),
  subtitleAr: z.string().trim().max(160).optional().transform((v) => v || null),
  subtitleEn: z.string().trim().max(160).optional().transform((v) => v || null),
  ctaAr: z.string().trim().max(30).optional().transform((v) => v || null),
  ctaEn: z.string().trim().max(30).optional().transform((v) => v || null),
  ctaTarget: z.string().trim().max(300).optional().transform((v) => v || null)
    .refine((v) => v === null || /^(category|product):\d+$/.test(v) || /^https:\/\/[^\s<>"']+$/.test(v), "cta"),
  sort: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
  startsAt: optDate, endsAt: optDate,
});

export async function savePromotion(db: Db, restaurantId: string, id: string | null, input: z.input<typeof promotionSchema>,
  images: { image?: string; mobile?: string | null }, actor: Actor) {
  const raw = promotionSchema.parse(input);
  const [r] = await db.select({ tz: restaurants.timezone }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) throw notFound();
  // Dates are typed in the restaurant's local time.
  const v = { ...raw, startsAt: raw.startsAt ? zonedToUtc(raw.startsAt, r.tz) : null, endsAt: raw.endsAt ? zonedToUtc(raw.endsAt, r.tz) : null };
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) throw new AppError("promotion_dates");
  if (id) {
    const set: Partial<typeof promotions.$inferInsert> = { ...v };
    if (images.image) set.imageMediaId = images.image;
    if (images.mobile !== undefined) set.mobileImageMediaId = images.mobile;
    const res = await db.update(promotions).set(set).where(and(eq(promotions.id, id), eq(promotions.restaurantId, restaurantId))).returning({ id: promotions.id });
    if (!res.length) throw notFound();
    await audit(db, restaurantId, actor, "promotion.updated", { id });
    return id;
  }
  if (!images.image) throw new AppError("promotion_image_required");
  const [p] = await db.insert(promotions).values({ ...v, restaurantId, imageMediaId: images.image, mobileImageMediaId: images.mobile ?? null }).returning({ id: promotions.id });
  await audit(db, restaurantId, actor, "promotion.created", { id: p!.id });
  return p!.id;
}

export async function archivePromotion(db: Db, restaurantId: string, id: string, actor: Actor) {
  const res = await db.update(promotions).set({ archivedAt: new Date(), isActive: false }).where(and(eq(promotions.id, id), eq(promotions.restaurantId, restaurantId))).returning({ id: promotions.id });
  if (!res.length) throw notFound();
  await audit(db, restaurantId, actor, "promotion.archived", { id });
}

export async function listPromotions(db: Db, restaurantId: string) {
  return db.select().from(promotions).where(and(eq(promotions.restaurantId, restaurantId), isNull(promotions.archivedAt))).orderBy(promotions.sort, desc(promotions.createdAt));
}
