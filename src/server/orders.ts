import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  modifierGroups, modifierOptions, orderEvents, orderItems, orders, productModifierGroups, products, productVariants, restaurants, tableSessions,
  type OrderModifier,
} from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import { AppError, notFound, tooMany } from "@/lib/errors";
import { checkLocation } from "@/lib/geo";
import { rateLimit } from "@/lib/rate-limit";
import { notify, channels } from "@/lib/events";
import { mediaUrl } from "@/lib/media";
import { availableNow, findRestaurantBySlug, resolveTable, DEFAULT_THEME } from "./menu";
import { orderingOpen } from "./entitlement";
import { attachSession, bumpSession, notifySessions, sessionHidden } from "./sessions";

export const submitSchema = z.object({
  slug: z.string().trim().min(2).max(60),
  tableToken: z.string().trim().min(16).max(64),
  idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9_-]{16,64}$/),
  lang: z.enum(["ar", "en"]).default("ar"),
  note: z.string().trim().max(500).optional().nullable(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    variantId: z.number().int().positive().nullish(),
    quantity: z.number().int().min(1).max(50),
    modifierIds: z.array(z.number().int().positive()).max(30).default([]),
    note: z.string().trim().max(200).nullish(),
  })).min(1).max(40),
  location: z.object({
    lat: z.number().finite(), lng: z.number().finite(), accuracy: z.number().finite().min(0), capturedAt: z.number().finite(),
  }).nullish(),
});
export type SubmitInput = z.infer<typeof submitSchema>;

export type SubmitResult = { number: number; trackingToken: string; sessionToken: string | null; status: string; total: number; duplicate: boolean };

/**
 * A customer order from a table QR. Everything that matters is decided here, never by the browser: the restaurant and
 * table come from the slug + secret table token, prices and preparation times from the synced POS menu, the location
 * is re-checked against the geofence, and the idempotency key makes a retried submission return the same order.
 * The order is durable once this returns; the POS pulls it, and only the cashier can accept it.
 */
export async function submitOrder(db: Db, input: SubmitInput, ip: string, now = new Date()): Promise<SubmitResult> {
  if (!rateLimit(`order:ip:${ip}`, 8, 6)) throw tooMany();
  const r = await findRestaurantBySlug(db, input.slug);
  if (!r) throw notFound("restaurant_not_found");

  // A retry of an order that was already stored returns it, whatever changed since.
  const existing = await findByKey(db, r.id, input.idempotencyKey);
  if (existing) return { ...existing, duplicate: true };

  const open = orderingOpen(r, now);
  if (!open.open) throw new AppError(`ordering_${open.reason}`, 409);
  const table = await resolveTable(db, r.id, input.tableToken);
  if (table.kind !== "ok") throw new AppError(table.kind === "replaced" ? "table_qr_replaced" : "table_unavailable", 409);
  if (!rateLimit(`order:table:${table.id}`, 12, 1)) throw tooMany();

  const verdict = r.geoEnabled
    ? checkLocation({ mode: r.geoMode, lat: r.lat, lng: r.lng, radiusM: r.radiusM, polygon: r.polygon, maxAccuracyM: r.maxAccuracyM }, input.location ?? null, now.getTime())
    : null;
  if (verdict && !verdict.ok) throw new AppError(`location_${verdict.reason}`, 403, { distanceM: verdict.distanceM });

  const priced = await priceItems(db, r.id, r.defaultPrepMinutes, input.items);
  const subtotal = priced.reduce((s, i) => s + i.lineTotal, 0);
  const trackingToken = randomToken(24);

  try {
    const result = await db.transaction(async (tx) => {
      const session = await attachSession(tx as unknown as Db, r, table.id!, now);
      const [seq] = await tx.update(restaurants).set({ orderSeq: sql`${restaurants.orderSeq} + 1` }).where(eq(restaurants.id, r.id)).returning({ n: restaurants.orderSeq });
      const [o] = await tx.insert(orders).values({
        restaurantId: r.id, tableId: table.id!, sessionId: session.id, tablePosUid: table.posUid!, tableNumber: table.number, number: seq!.n, trackingToken,
        idempotencyKey: input.idempotencyKey, status: "submitted", subtotal, total: subtotal, currencyCode: r.currencyCode, currencyDecimals: r.currencyDecimals,
        note: input.note || null, lang: input.lang, clientIp: ip, submittedAt: now,
        location: input.location ? { lat: input.location.lat, lng: input.location.lng, accuracy: input.location.accuracy, distanceM: verdict?.distanceM ?? null, inside: verdict?.ok ?? false } : null,
      }).returning();
      await tx.insert(orderItems).values(priced.map((i) => ({ ...i, orderId: o!.id, restaurantId: r.id })));
      await tx.insert(orderEvents).values({ orderId: o!.id, restaurantId: r.id, status: "submitted", at: now, actor: "customer" });
      await bumpSession(tx as unknown as Db, session.id, true, now);
      return { order: o!, session };
    });
    notify(channels.restaurantOrders(r.id));
    notifySessions([result.session.id]);
    const o = result.order;
    return { number: o.number, trackingToken: o.trackingToken, sessionToken: result.session.token, status: o.status, total: o.total, duplicate: false };
  } catch (e) {
    // Two identical submissions racing: the unique key lets only one in; the other returns it.
    const again = await findByKey(db, r.id, input.idempotencyKey);
    if (again) return { ...again, duplicate: true };
    throw e;
  }
}

async function findByKey(db: Db, restaurantId: string, key: string) {
  const [o] = await db.select({ number: orders.number, trackingToken: orders.trackingToken, sessionToken: tableSessions.token, status: orders.status, total: orders.total })
    .from(orders).leftJoin(tableSessions, eq(tableSessions.id, orders.sessionId))
    .where(and(eq(orders.restaurantId, restaurantId), eq(orders.idempotencyKey, key))).limit(1);
  return o ?? null;
}

type ItemInput = SubmitInput["items"][number];

/** Authoritative pricing and validation of the selected product, flavor and options (min/max per option group). */
export async function priceItems(db: Db, restaurantId: string, defaultPrep: number, items: ItemInput[]) {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const prods = await db.select().from(products).where(and(eq(products.restaurantId, restaurantId), inArray(products.posId, productIds)));
  const byId = new Map(prods.map((p) => [p.posId, p]));
  const vars = await db.select().from(productVariants)
    .where(and(eq(productVariants.restaurantId, restaurantId), inArray(productVariants.productPosId, productIds), eq(productVariants.isActive, true)));
  const links = await db.select().from(productModifierGroups).where(and(eq(productModifierGroups.restaurantId, restaurantId), inArray(productModifierGroups.productPosId, productIds)));
  const groupIds = [...new Set(links.map((l) => l.groupPosId))];
  const groups = groupIds.length ? await db.select().from(modifierGroups).where(and(eq(modifierGroups.restaurantId, restaurantId), inArray(modifierGroups.posId, groupIds), eq(modifierGroups.isActive, true))) : [];
  const options = groupIds.length ? await db.select().from(modifierOptions).where(and(eq(modifierOptions.restaurantId, restaurantId), inArray(modifierOptions.groupPosId, groupIds), eq(modifierOptions.isActive, true))).orderBy(asc(modifierOptions.sort)) : [];

  return items.map((item, index) => {
    const p = byId.get(item.productId);
    if (!p || !p.isActive) throw new AppError("product_not_found", 400, { index });
    if (!availableNow(p)) throw new AppError("product_unavailable", 409, { index, name: p.nameAr });
    const productVars = vars.filter((v) => v.productPosId === p.posId);
    let base = p.price;
    let variantName: string | null = null;
    if (item.variantId != null) {
      const v = productVars.find((x) => x.posId === item.variantId);
      if (!v) throw new AppError("variant_invalid", 400, { index });
      base = v.priceOverride ?? p.price;
      variantName = v.name;
    } else if (productVars.length > 0) {
      // Products with flavors must have one chosen (the POS sells the flavor, not the bare product).
      throw new AppError("variant_required", 400, { index });
    }
    const productGroups = links.filter((l) => l.productPosId === p.posId).map((l) => groups.find((g) => g.posId === l.groupPosId)).filter((g) => g !== undefined);
    const chosen: OrderModifier[] = [];
    const seen = new Set<number>();
    for (const id of item.modifierIds) {
      if (seen.has(id)) throw new AppError("modifier_duplicate", 400, { index });
      seen.add(id);
      const o = options.find((x) => x.posId === id);
      const g = o && productGroups.find((x) => x.posId === o.groupPosId);
      if (!o || !g) throw new AppError("modifier_invalid", 400, { index });
      chosen.push({ posId: o.posId, group: g.name, name: o.name, priceDelta: o.priceDelta });
    }
    for (const g of productGroups) {
      const count = item.modifierIds.filter((id) => options.some((o) => o.posId === id && o.groupPosId === g.posId)).length;
      if (count < g.minSelect || count > g.maxSelect) throw new AppError("modifier_count", 400, { index, group: g.name, min: g.minSelect, max: g.maxSelect });
    }
    const unitPrice = base + chosen.reduce((s, m) => s + m.priceDelta, 0);
    if (unitPrice < 0) throw new AppError("price_invalid", 400, { index });
    return {
      productPosId: p.posId, posUnitId: p.posUnitId, variantPosId: item.variantId ?? null, nameAr: p.nameAr, nameEn: p.nameEn, variantName,
      quantity: item.quantity, unitPrice, modifiers: chosen, note: item.note || null, prepMinutes: p.prepMinutes ?? defaultPrep, lineTotal: unitPrice * item.quantity,
    };
  });
}

/** The customer's tracking view: this order only, no internal ids, no other orders of the table. */
export async function getTracking(db: Db, trackingToken: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(trackingToken)) return null;
  const [o] = await db.select().from(orders).where(eq(orders.trackingToken, trackingToken)).limit(1);
  if (!o || (await sessionHidden(db, o.sessionId, now))) return null;
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, o.restaurantId)).limit(1);
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).orderBy(asc(orderItems.id));
  const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, o.id)).orderBy(asc(orderEvents.at), asc(orderEvents.id));
  return {
    restaurant: { slug: r!.slug, nameAr: r!.nameAr, nameEn: r!.nameEn, logo: mediaUrl(r!.logoMediaId, "sm"), theme: { ...DEFAULT_THEME, ...r!.theme },
      currency: { symbol: r!.currencySymbol, decimals: o.currencyDecimals }, phone: r!.showContact ? r!.phone : null },
    order: {
      number: o.number, table: o.tableNumber, status: o.status, total: o.total, note: o.note, lang: o.lang,
      submittedAt: o.submittedAt.toISOString(), deliveredAt: o.deliveredAt?.toISOString() ?? null, acceptedAt: o.acceptedAt?.toISOString() ?? null,
      preparingAt: o.preparingAt?.toISOString() ?? null, readyAt: o.readyAt?.toISOString() ?? null, completedAt: o.completedAt?.toISOString() ?? null,
      rejectedAt: o.rejectedAt?.toISOString() ?? null, cancelledAt: o.cancelledAt?.toISOString() ?? null, reason: o.reason,
      prepMinutes: o.prepMinutes, estimatedReadyAt: o.estimatedReadyAt?.toISOString() ?? null, etaChangedAt: o.etaChangedAt?.toISOString() ?? null,
      items: items.map((i) => ({ nameAr: i.nameAr, nameEn: i.nameEn, variantName: i.variantName, quantity: i.quantity, lineTotal: i.lineTotal, note: i.note, modifiers: i.modifiers.map((m) => m.name) })),
      history: events.map((e) => ({ status: e.status, at: e.at.toISOString() })),
    },
    serverTime: now.toISOString(),
  };
}
export type Tracking = NonNullable<Awaited<ReturnType<typeof getTracking>>>;
