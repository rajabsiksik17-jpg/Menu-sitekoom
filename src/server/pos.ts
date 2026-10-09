import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  categories, diningTables, enrollmentCodes, media, modifierGroups, modifierOptions, orderEvents, orderItems, orders, posDevices,
  productModifierGroups, products, productVariants, restaurants, revokedTableTokens, type OrderInvoice,
} from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { AppError, forbidden, notFound, unauthorized } from "@/lib/errors";
import { env } from "@/lib/env";
import { toMinor } from "@/lib/money";
import { audit, syncLog } from "@/lib/audit";
import { channels, waitFor } from "@/lib/events";
import type { InvoicePayload, MenuPayload } from "./pos-schemas";
import { bumpSession, notifySessions, pendingRequests } from "./sessions";
import { serviceState } from "./entitlement";

export type Device = { id: string; restaurantId: string; name: string };

/** Bearer token → active device of an existing restaurant. The token itself is never stored, only its SHA-256. */
export async function authenticateDevice(db: Db, authorization: string | null, ip: string): Promise<Device> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (token.length < 40) throw unauthorized("device_token_missing");
  const [row] = await db.select({ id: posDevices.id, restaurantId: posDevices.restaurantId, name: posDevices.name, status: posDevices.status, lastSeenAt: posDevices.lastSeenAt })
    .from(posDevices).where(eq(posDevices.tokenHash, sha256(token))).limit(1);
  if (!row) throw unauthorized("device_unknown");
  if (row.status !== "active") throw unauthorized("device_revoked");
  const now = new Date();
  if (!row.lastSeenAt || now.getTime() - row.lastSeenAt.getTime() > 15_000) {
    await db.update(posDevices).set({ lastSeenAt: now, lastIp: ip }).where(eq(posDevices.id, row.id));
    await db.update(restaurants).set({ posLastSeenAt: now }).where(eq(restaurants.id, row.restaurantId));
  }
  return { id: row.id, restaurantId: row.restaurantId, name: row.name };
}

/**
 * Enrollment: the platform owner generated a one-time code for a restaurant; the POS sends it with its license
 * installation code. The account is bound to that installation (first enrollment binds it, later ones must match),
 * any previous device of the restaurant is revoked (one POS receives the orders), and a fresh device token is returned once.
 */
export async function enroll(db: Db, input: { code: string; installationCode?: string | null; deviceName: string; appVersion?: string | null }, ip: string) {
  const codeHash = sha256(input.code.trim().toUpperCase());
  const installation = input.installationCode?.trim().toUpperCase() || null;
  return db.transaction(async (tx) => {
    const [code] = await tx.select().from(enrollmentCodes).where(eq(enrollmentCodes.codeHash, codeHash)).limit(1);
    if (!code || code.usedAt || code.expiresAt.getTime() < Date.now()) throw new AppError("enrollment_code_invalid", 400);
    const [r] = await tx.select().from(restaurants).where(eq(restaurants.id, code.restaurantId)).limit(1);
    if (!r) throw new AppError("enrollment_code_invalid", 400);
    if (r.installationCode && installation && r.installationCode !== installation) throw new AppError("installation_mismatch", 403);
    if (r.installationCode && !installation) throw new AppError("installation_required", 400);

    const token = randomToken(32);
    await tx.update(posDevices).set({ status: "revoked", revokedAt: new Date() })
      .where(and(eq(posDevices.restaurantId, r.id), eq(posDevices.status, "active")));
    const [device] = await tx.insert(posDevices).values({
      restaurantId: r.id, name: input.deviceName, tokenHash: sha256(token), installationCode: installation, appVersion: input.appVersion ?? null, lastIp: ip,
    }).returning();
    await tx.update(enrollmentCodes).set({ usedAt: new Date(), usedByDeviceId: device!.id }).where(eq(enrollmentCodes.id, code.id));
    if (!r.installationCode && installation) await tx.update(restaurants).set({ installationCode: installation, updatedAt: new Date() }).where(eq(restaurants.id, r.id));
    await audit(tx as unknown as Db, r.id, { type: "pos", id: device!.id, ip }, "pos.enrolled", { deviceName: input.deviceName, installation });
    return {
      deviceId: device!.id, token,
      restaurant: { id: r.id, slug: r.slug, name: r.nameAr, menuUrl: `${env.publicUrl}/${r.slug}` },
    };
  });
}

export async function status(db: Db, device: Device) {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, device.restaurantId)).limit(1);
  if (!r) throw notFound();
  const state = serviceState(r);
  return {
    restaurant: { id: r.id, slug: r.slug, name: r.nameAr, menuUrl: `${env.publicUrl}/${r.slug}` },
    service: state, orderingPaused: r.orderingPaused,
    menu: { version: r.menuVersion, hash: r.menuHash, syncedAt: r.menuSyncedAt },
    serverTime: new Date().toISOString(),
  };
}

// ── Menu ───────────────────────────────────────────────────────────────────

/**
 * Full menu snapshot from the POS (the POS is the source of truth). Upserted by POS ids in one transaction; items no
 * longer sent are deactivated (never deleted: past orders keep their snapshots anyway). Presentation fields managed in
 * the dashboard (featured, new, labels) are left untouched. Returns the images the platform still needs.
 */
export async function syncMenu(db: Db, device: Device, m: MenuPayload) {
  const rid = device.restaurantId;
  const d = m.currency.decimals;
  const productIds = new Set<number>();
  for (const p of m.products) {
    if (productIds.has(p.id)) throw new AppError("duplicate_product", 400, { id: p.id });
    productIds.add(p.id);
  }
  const groupIds = new Set(m.modifierGroups.map((g) => g.id));

  const result = await db.transaction(async (tx) => {
    const ex = (c: string) => sql.raw(`excluded.${c}`);
    // categories
    if (m.categories.length)
      await tx.insert(categories).values(m.categories.map((c) => ({
        restaurantId: rid, posId: c.id, nameAr: c.name, icon: c.icon ?? null, color: c.color ?? null, imageSha: c.image ?? null, sort: c.sort, isActive: c.active,
      }))).onConflictDoUpdate({ target: [categories.restaurantId, categories.posId], set: {
        nameAr: ex("name_ar"), icon: ex("icon"), color: ex("color"), imageSha: ex("image_sha"), sort: ex("sort"), isActive: ex("is_active"),
      } });
    await tx.update(categories).set({ isActive: false }).where(and(eq(categories.restaurantId, rid),
      m.categories.length ? notInArray(categories.posId, m.categories.map((c) => c.id)) : sql`true`));

    // products
    for (let i = 0; i < m.products.length; i += 500) {
      const chunk = m.products.slice(i, i + 500);
      await tx.insert(products).values(chunk.map((p) => ({
        restaurantId: rid, posId: p.id, posUnitId: p.unitId, categoryPosId: p.categoryId ?? null, nameAr: p.nameAr, nameEn: p.nameEn ?? null,
        descriptionAr: p.description ?? null, price: toMinor(p.price, d), imageSha: p.image ?? null, prepMinutes: p.prepMinutes ?? null,
        isAvailable: p.available, isActive: true, sort: p.sort,
      }))).onConflictDoUpdate({ target: [products.restaurantId, products.posId], set: {
        posUnitId: ex("pos_unit_id"), categoryPosId: ex("category_pos_id"), nameAr: ex("name_ar"), nameEn: ex("name_en"), descriptionAr: ex("description_ar"),
        price: ex("price"), imageSha: ex("image_sha"), prepMinutes: ex("prep_minutes"), isAvailable: ex("is_available"), isActive: ex("is_active"), sort: ex("sort"),
      } });
    }
    await tx.update(products).set({ isActive: false }).where(and(eq(products.restaurantId, rid),
      productIds.size ? notInArray(products.posId, [...productIds]) : sql`true`));

    // variants
    const variants = m.products.flatMap((p) => p.variants.map((v) => ({
      restaurantId: rid, productPosId: p.id, posId: v.id, name: v.name, priceOverride: v.price == null ? null : toMinor(v.price, d), imageSha: v.image ?? null, sort: v.sort, isActive: true,
    })));
    if (variants.length)
      await tx.insert(productVariants).values(variants).onConflictDoUpdate({ target: [productVariants.restaurantId, productVariants.posId], set: {
        productPosId: ex("product_pos_id"), name: ex("name"), priceOverride: ex("price_override"), imageSha: ex("image_sha"), sort: ex("sort"), isActive: ex("is_active"),
      } });
    await tx.update(productVariants).set({ isActive: false }).where(and(eq(productVariants.restaurantId, rid),
      variants.length ? notInArray(productVariants.posId, variants.map((v) => v.posId)) : sql`true`));

    // modifier groups and options
    if (m.modifierGroups.length)
      await tx.insert(modifierGroups).values(m.modifierGroups.map((g) => ({
        restaurantId: rid, posId: g.id, name: g.name, minSelect: g.min, maxSelect: Math.max(g.max, g.min, 1), sort: g.sort, isActive: true,
      }))).onConflictDoUpdate({ target: [modifierGroups.restaurantId, modifierGroups.posId], set: {
        name: ex("name"), minSelect: ex("min_select"), maxSelect: ex("max_select"), sort: ex("sort"), isActive: ex("is_active"),
      } });
    await tx.update(modifierGroups).set({ isActive: false }).where(and(eq(modifierGroups.restaurantId, rid),
      groupIds.size ? notInArray(modifierGroups.posId, [...groupIds]) : sql`true`));
    const options = m.modifierGroups.flatMap((g) => g.options.map((o) => ({
      restaurantId: rid, groupPosId: g.id, posId: o.id, name: o.name, priceDelta: toMinor(o.price, d), isDefault: o.isDefault, sort: o.sort, isActive: true,
    })));
    if (options.length)
      await tx.insert(modifierOptions).values(options).onConflictDoUpdate({ target: [modifierOptions.restaurantId, modifierOptions.posId], set: {
        groupPosId: ex("group_pos_id"), name: ex("name"), priceDelta: ex("price_delta"), isDefault: ex("is_default"), sort: ex("sort"), isActive: ex("is_active"),
      } });
    await tx.update(modifierOptions).set({ isActive: false }).where(and(eq(modifierOptions.restaurantId, rid),
      options.length ? notInArray(modifierOptions.posId, options.map((o) => o.posId)) : sql`true`));

    await tx.delete(productModifierGroups).where(eq(productModifierGroups.restaurantId, rid));
    const links = m.products.flatMap((p) => p.groups.filter((g) => groupIds.has(g)).map((g, i) => ({ restaurantId: rid, productPosId: p.id, groupPosId: g, sort: i })));
    if (links.length) await tx.insert(productModifierGroups).values(links).onConflictDoNothing();

    const [r] = await tx.update(restaurants).set({
      menuVersion: sql`${restaurants.menuVersion} + 1`, menuHash: m.hash, menuSyncedAt: new Date(), updatedAt: new Date(),
      defaultPrepMinutes: m.defaultPrepMinutes, requireAcceptance: m.requireAcceptance,
      currencyCode: m.currency.code, currencySymbol: m.currency.symbol || m.currency.code, currencyDecimals: d,
    }).where(eq(restaurants.id, rid)).returning({ menuVersion: restaurants.menuVersion });
    return r!.menuVersion;
  });

  const shas = new Set<string>();
  for (const c of m.categories) if (c.image) shas.add(c.image);
  for (const p of m.products) {
    if (p.image) shas.add(p.image);
    for (const v of p.variants) if (v.image) shas.add(v.image);
  }
  const missing = await missingImages(db, rid, [...shas]);
  await syncLog(db, rid, device.id, "menu", true, `v${result}: ${m.products.length} products, ${m.categories.length} categories, ${missing.length} images missing`);
  return { menuVersion: result, missingImages: missing };
}

export async function missingImages(db: Db, restaurantId: string, shas: string[]) {
  if (shas.length === 0) return [];
  const have = new Set<string>();
  for (let i = 0; i < shas.length; i += 500) {
    const rows = await db.select({ sha: media.sha256 }).from(media).where(and(eq(media.restaurantId, restaurantId), inArray(media.sha256, shas.slice(i, i + 500))));
    rows.forEach((r) => have.add(r.sha));
  }
  return shas.filter((s) => !have.has(s));
}

// ── Tables ─────────────────────────────────────────────────────────────────

export const tableUrl = (slug: string, token: string) => `${env.publicUrl}/${slug}/t/${token}`;

/** Idempotent by the POS table uid: retrying never creates a second table or a different token. */
export async function syncTables(db: Db, device: Device, tables: { uid: string; number: number; name?: string | null; seats?: number | null; status: string }[]) {
  const rid = device.restaurantId;
  const [r] = await db.select({ slug: restaurants.slug }).from(restaurants).where(eq(restaurants.id, rid)).limit(1);
  if (!r) throw notFound();
  if (tables.length)
    await db.insert(diningTables).values(tables.map((t) => ({
      restaurantId: rid, posUid: t.uid.toLowerCase(), number: t.number, name: t.name ?? null, seats: t.seats ?? null, status: t.status, token: randomToken(16),
    }))).onConflictDoUpdate({ target: [diningTables.restaurantId, diningTables.posUid], set: {
      number: sql.raw("excluded.number"), name: sql.raw("excluded.name"), seats: sql.raw("excluded.seats"), status: sql.raw("excluded.status"), updatedAt: new Date(),
    } });
  const rows = await db.select().from(diningTables).where(eq(diningTables.restaurantId, rid));
  await syncLog(db, rid, device.id, "tables", true, `${tables.length} received, ${rows.length} total`);
  return { tables: rows.map((t) => ({ uid: t.posUid, number: t.number, status: t.status, token: t.token, url: tableUrl(r.slug, t.token) })) };
}

/** New QR token for a table; the old one is kept as "revoked" (scanning it explains the code was replaced). */
export async function rotateTable(db: Db, restaurantId: string, uid: string, actor: { type: "pos" | "admin"; id: string; ip: string }) {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(diningTables).where(and(eq(diningTables.restaurantId, restaurantId), eq(diningTables.posUid, uid.toLowerCase()))).limit(1);
    if (!t) throw notFound("table_not_found");
    const token = randomToken(16);
    await tx.insert(revokedTableTokens).values({ token: t.token, tableId: t.id }).onConflictDoNothing();
    await tx.update(diningTables).set({ token, tokenRotatedAt: new Date(), updatedAt: new Date() }).where(eq(diningTables.id, t.id));
    await audit(tx as unknown as Db, restaurantId, actor, "table.token_rotated", { table: t.number, uid: t.posUid });
    const [r] = await tx.select({ slug: restaurants.slug }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
    return { uid: t.posUid, token, url: tableUrl(r!.slug, token) };
  });
}

// ── Orders → POS ───────────────────────────────────────────────────────────

/** Orders the POS has not confirmed yet (status "submitted"), oldest first, with their items. */
export async function pendingOrders(db: Db, restaurantId: string, limit = 50) {
  const rows = await db.select().from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), eq(orders.status, "submitted")))
    .orderBy(orders.submittedAt).limit(limit);
  if (rows.length === 0) return [];
  const items = await db.select().from(orderItems).where(inArray(orderItems.orderId, rows.map((o) => o.id))).orderBy(orderItems.id);
  return rows.map((o) => ({
    id: o.id, number: o.number, tableUid: o.tablePosUid, tableNumber: o.tableNumber, note: o.note, lang: o.lang,
    subtotal: o.subtotal, total: o.total, currencyDecimals: o.currencyDecimals, submittedAt: o.submittedAt.toISOString(),
    items: items.filter((i) => i.orderId === o.id).map((i) => ({
      productId: i.productPosId, unitId: i.posUnitId, variantId: i.variantPosId, name: i.nameAr, variantName: i.variantName,
      quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal, prepMinutes: i.prepMinutes, note: i.note,
      modifiers: i.modifiers.map((m) => ({ id: m.posId, group: m.group, name: m.name, priceDelta: m.priceDelta })),
    })),
  }));
}

/** The POS stored these orders locally: they become "delivered" (never re-sent). Idempotent. */
export async function ackOrders(db: Db, device: Device, ids: string[]) {
  const now = new Date();
  const updated = await db.update(orders).set({ status: "delivered", deliveredAt: now, updatedAt: now })
    .where(and(eq(orders.restaurantId, device.restaurantId), inArray(orders.id, ids), eq(orders.status, "submitted")))
    .returning({ id: orders.id, sessionId: orders.sessionId });
  if (updated.length) {
    await db.insert(orderEvents).values(updated.map((u) => ({ orderId: u.id, restaurantId: device.restaurantId, status: "delivered", at: now, actor: "pos" })));
    const sessions = [...new Set(updated.map((u) => u.sessionId).filter((s): s is string => !!s))];
    for (const s of sessions) await bumpSession(db, s, false, now);
    notifySessions(sessions);
  }
  await syncLog(db, device.restaurantId, device.id, "ack", true, `${updated.length}/${ids.length}`);
  return { acknowledged: updated.map((u) => u.id) };
}

type StatusUpdate = {
  id: string; status: string; seq: number; at: Date; prepMinutes?: number | null; estimatedReadyAt?: Date | null;
  reason?: string | null; posOrderId?: number | null; groupLabel?: string | null; invoice?: InvoicePayload | null;
};

/** The POS invoice in minor units of the order's currency (amounts are taken as issued, never recomputed). */
function invoiceMinor(i: InvoicePayload, decimals: number): OrderInvoice {
  const m = (v: number) => toMinor(v, decimals);
  return {
    saleId: i.saleId, number: i.number, issuedAt: i.issuedAt.toISOString(), cashier: i.cashier ?? null, paymentMethod: i.paymentMethod ?? null,
    taxNumber: i.taxNumber ?? null,
    lines: i.lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: m(l.unitPrice), discount: m(l.discount), total: m(l.total), options: l.options, note: l.note ?? null })),
    subtotal: m(i.subtotal), discount: m(i.discount), tax: m(i.tax), total: m(i.total), paid: m(i.paid),
  };
}

const FINAL = new Set(["completed", "rejected", "cancelled"]);

/**
 * Status changes made at the cashier. Each carries a per-order sequence number from the POS: a retried or late update
 * (seq ≤ stored) is ignored, so the platform always converges to the POS state. Timestamps come from the POS.
 */
export async function applyStatuses(db: Db, device: Device, updates: StatusUpdate[]) {
  const applied: string[] = [];
  const touched: string[] = [];
  for (const u of updates) {
    const ok = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(and(eq(orders.id, u.id), eq(orders.restaurantId, device.restaurantId))).limit(1).for("update");
      if (!o) return false;
      if (u.seq <= o.statusSeq) return true; // already applied (retry) or older than what we have
      if (FINAL.has(o.status) && o.status !== u.status) return true; // a closed order stays closed
      const set: Partial<typeof orders.$inferInsert> = { status: u.status, statusSeq: u.seq, updatedAt: new Date() };
      if (u.status === "accepted" && !o.acceptedAt) set.acceptedAt = u.at;
      if (u.status === "preparing") { set.preparingAt = o.preparingAt ?? u.at; set.acceptedAt = o.acceptedAt ?? u.at; }
      if (u.status === "ready") set.readyAt = u.at;
      if (u.status === "completed") set.completedAt = u.at;
      if (u.status === "rejected") { set.rejectedAt = u.at; set.reason = u.reason ?? null; }
      if (u.status === "cancelled") { set.cancelledAt = u.at; set.reason = u.reason ?? null; }
      if (u.prepMinutes != null) set.prepMinutes = u.prepMinutes;
      if (u.estimatedReadyAt !== undefined) {
        if ((u.estimatedReadyAt?.getTime() ?? null) !== (o.estimatedReadyAt?.getTime() ?? null) && o.estimatedReadyAt) set.etaChangedAt = new Date();
        set.estimatedReadyAt = u.estimatedReadyAt;
      }
      if (u.posOrderId != null) set.posOrderId = u.posOrderId;
      if (u.groupLabel !== undefined) set.groupLabel = u.groupLabel;
      if (u.invoice) set.invoice = invoiceMinor(u.invoice, o.currencyDecimals);
      if (!o.deliveredAt) set.deliveredAt = u.at;
      await tx.update(orders).set(set).where(eq(orders.id, o.id));
      if (u.status !== o.status || u.estimatedReadyAt !== undefined)
        await tx.insert(orderEvents).values({ orderId: o.id, restaurantId: o.restaurantId, status: u.status, at: u.at, actor: "pos", note: u.reason ?? null });
      if (o.sessionId) {
        await bumpSession(tx as unknown as Db, o.sessionId, u.status !== o.status || (!!u.invoice && !o.invoice) || set.etaChangedAt !== undefined);
        touched.push(o.sessionId);
      }
      return true;
    });
    if (ok) applied.push(u.id);
  }
  notifySessions(touched);
  await syncLog(db, device.restaurantId, device.id, "status", true, `${applied.length}/${updates.length}`);
  return { applied };
}

/** New orders and invoice requests for the POS long poll (a request wakes the waiting POS like an order does). */
export async function waitForOrders(db: Db, restaurantId: string, waitMs: number, signal?: AbortSignal) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const [list, requests] = await Promise.all([pendingOrders(db, restaurantId), pendingRequests(db, restaurantId)]);
    if (list.length || requests.length || Date.now() >= deadline || signal?.aborted) return { orders: list, requests };
    await waitFor(channels.restaurantOrders(restaurantId), Math.min(5000, deadline - Date.now()), signal);
  }
}

export function assertSameRestaurant(device: Device, restaurantId: string) {
  if (device.restaurantId !== restaurantId) throw forbidden();
}

