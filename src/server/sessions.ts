import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { diningTables, invoiceRequests, orderItems, orders, restaurants, tableSessions, type OrderInvoice } from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import { AppError, notFound, tooMany } from "@/lib/errors";
import { channels, notify, waitFor } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";
import { mediaUrl } from "@/lib/media";
import { syncLog } from "@/lib/audit";
import { DEFAULT_THEME } from "./menu";
import type { Device } from "./pos";

/**
 * Table sessions — one sitting of a party at a table.
 *
 * - The first order from a table opens a session (or joins the table's open one); its token goes to the customer's phone.
 * - The cashier ends it at the POS ("end table session"), or it closes by itself after the restaurant's idle time once
 *   nothing is still being prepared. Closing never deletes anything: orders and invoices stay for the restaurant.
 * - After closing, the customers still see the final invoice for the restaurant's configured minutes; then the session
 *   token stops working (the server refuses it — not just the browser forgetting it), and a new party starts clean.
 */

type Tx = Db;
type Session = typeof tableSessions.$inferSelect;
type Restaurant = typeof restaurants.$inferSelect;

const ACTIVE_ORDER = ["submitted", "delivered", "accepted", "preparing", "ready"];
const WAITING_ORDER = ["submitted", "delivered"];
const ACTIVE_REQUEST = ["pending", "delivered", "acknowledged"];
const TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

/** Records a change: everyone watching the session re-reads it. `customer` = worth a notification badge. */
export async function bumpSession(tx: Tx, sessionId: string, customer: boolean, now = new Date()) {
  await tx.update(tableSessions).set({
    version: sql`${tableSessions.version} + 1`,
    ...(customer ? { customerVersion: sql`${tableSessions.customerVersion} + 1` } : {}),
    lastActivityAt: now,
  }).where(eq(tableSessions.id, sessionId));
}

export function notifySessions(ids: Iterable<string | null | undefined>) {
  for (const id of new Set(ids)) if (id) notify(channels.session(id));
}

async function hasActiveOrders(tx: Tx, sessionId: string) {
  const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(orders)
    .where(and(eq(orders.sessionId, sessionId), inArray(orders.status, ACTIVE_ORDER)));
  return (row?.n ?? 0) > 0;
}

async function closeSession(tx: Tx, s: Session, r: Pick<Restaurant, "invoiceVisibleMinutes">, reason: "pos" | "idle", at: Date) {
  const visibleUntil = new Date(at.getTime() + Math.max(0, r.invoiceVisibleMinutes) * 60_000);
  await tx.update(tableSessions).set({
    closedAt: at, closeReason: reason, visibleUntil,
    version: sql`${tableSessions.version} + 1`, customerVersion: sql`${tableSessions.customerVersion} + 1`,
  }).where(and(eq(tableSessions.id, s.id), isNull(tableSessions.closedAt)));
}

const idle = (s: Session, r: Pick<Restaurant, "sessionIdleMinutes">, now: Date) =>
  now.getTime() - s.lastActivityAt.getTime() > Math.max(1, r.sessionIdleMinutes) * 60_000;

/**
 * The session a new order joins (inside the order transaction). The table row is locked so two first orders arriving
 * together share one session; an open session that idled out with nothing in progress is closed and a new one opened.
 */
export async function attachSession(tx: Tx, r: Restaurant, tableId: string, now: Date): Promise<Session> {
  await tx.select({ id: diningTables.id }).from(diningTables).where(eq(diningTables.id, tableId)).for("update");
  const [open] = await tx.select().from(tableSessions).where(and(eq(tableSessions.tableId, tableId), isNull(tableSessions.closedAt))).limit(1);
  if (open) {
    if (!(idle(open, r, now) && !(await hasActiveOrders(tx, open.id)))) return open;
    await closeSession(tx, open, r, "idle", now);
  }
  const [created] = await tx.insert(tableSessions).values({ restaurantId: r.id, tableId, token: randomToken(24), openedAt: now, lastActivityAt: now }).returning();
  return created!;
}

// ── Customer view ──────────────────────────────────────────────────────────

/**
 * What the table's customers see: their session's orders (newest first), the invoices the POS issued for them, and the
 * invoice request. Nothing from other sessions or tables, no internal ids. Returns { gone } once the session is no longer
 * visible (closed and its invoice display time passed) — the token is then useless.
 */
export async function getSessionView(db: Db, token: string, now = new Date()) {
  if (!TOKEN.test(token)) return null;
  let [s] = await db.select().from(tableSessions).where(eq(tableSessions.token, token)).limit(1);
  if (!s) return null;
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, s.restaurantId)).limit(1);
  if (!r) return null;
  // Lazy idle close (no background job needed): only when nothing is waiting or being prepared.
  if (!s.closedAt && idle(s, r, now) && !(await hasActiveOrders(db, s.id))) {
    await db.transaction((tx) => closeSession(tx as unknown as Db, s!, r, "idle", now));
    [s] = await db.select().from(tableSessions).where(eq(tableSessions.id, s.id)).limit(1);
  }
  if (s!.closedAt && (!s!.visibleUntil || s!.visibleUntil <= now)) return { gone: true as const };
  const session = s!;

  const [table] = await db.select({ number: diningTables.number, name: diningTables.name }).from(diningTables).where(eq(diningTables.id, session.tableId)).limit(1);
  const list = await db.select().from(orders).where(eq(orders.sessionId, session.id)).orderBy(desc(orders.number));
  const items = list.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, list.map((o) => o.id))).orderBy(asc(orderItems.id)) : [];
  const [request] = await db.select().from(invoiceRequests).where(eq(invoiceRequests.sessionId, session.id)).orderBy(desc(invoiceRequests.requestedAt)).limit(1);

  const invoiced = list.filter((o) => o.invoice && !["rejected", "cancelled"].includes(o.status));
  const waiting = list.filter((o) => WAITING_ORDER.includes(o.status));
  // The invoice is shown only when it is current: every submitted order has been decided by the cashier. While a newer
  // order waits, the previous total would be misleading, so the invoice controls are held back.
  const invoiceState = invoiced.length === 0 ? (waiting.length ? "waiting" : "none") : waiting.length ? "updating" : "ready";

  return {
    gone: false as const,
    id: session.id,
    version: session.version,
    customerVersion: session.customerVersion,
    status: session.closedAt ? ("closed" as const) : ("open" as const),
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    visibleUntil: session.visibleUntil?.toISOString() ?? null,
    restaurant: {
      slug: r.slug, nameAr: r.nameAr, nameEn: r.nameEn, logo: mediaUrl(r.logoMediaId, "sm"), theme: { ...DEFAULT_THEME, ...r.theme },
      currency: { symbol: r.currencySymbol, decimals: r.currencyDecimals }, address: r.showContact ? r.address : null, phone: r.showContact ? r.phone : null,
    },
    table: { number: table?.number ?? 0, name: table?.name ?? null },
    orders: list.map((o) => ({
      number: o.number, trackingToken: o.trackingToken, status: o.status, total: o.total, note: o.note,
      submittedAt: o.submittedAt.toISOString(), deliveredAt: o.deliveredAt?.toISOString() ?? null, acceptedAt: o.acceptedAt?.toISOString() ?? null,
      preparingAt: o.preparingAt?.toISOString() ?? null, readyAt: o.readyAt?.toISOString() ?? null, completedAt: o.completedAt?.toISOString() ?? null,
      rejectedAt: o.rejectedAt?.toISOString() ?? null, cancelledAt: o.cancelledAt?.toISOString() ?? null, reason: o.reason,
      prepMinutes: o.prepMinutes, estimatedReadyAt: o.estimatedReadyAt?.toISOString() ?? null,
      items: items.filter((i) => i.orderId === o.id).map((i) => ({
        nameAr: i.nameAr, nameEn: i.nameEn, variantName: i.variantName, quantity: i.quantity, lineTotal: i.lineTotal, note: i.note, modifiers: i.modifiers.map((m) => m.name),
      })),
      invoice: o.invoice ?? null,
    })),
    invoice: {
      state: invoiceState as "none" | "waiting" | "updating" | "ready",
      count: invoiced.length,
      total: invoiced.reduce((sum, o) => sum + (o.invoice as OrderInvoice).total, 0),
      paid: invoiced.reduce((sum, o) => sum + (o.invoice as OrderInvoice).paid, 0),
    },
    request: request ? { status: request.status, requestedAt: request.requestedAt.toISOString(), handledAt: request.handledAt?.toISOString() ?? null } : null,
    serverTime: now.toISOString(),
  };
}
export type SessionView = Extract<NonNullable<Awaited<ReturnType<typeof getSessionView>>>, { gone: false }>;

/** Long poll for the customer: returns at once when the session changed since `since`, else after up to `waitMs`. */
export async function waitForSession(db: Db, token: string, since: number | null, waitMs: number, signal?: AbortSignal) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const view = await getSessionView(db, token);
    if (!view || view.gone || since === null || view.version !== since || Date.now() >= deadline || signal?.aborted) return view;
    await waitFor(channels.session(view.id), Math.min(5000, deadline - Date.now()), signal);
  }
}

/** Public shape (the session id stays on the server). */
export function publicView(v: Awaited<ReturnType<typeof getSessionView>>) {
  if (!v || v.gone) return v;
  const { id: _id, ...rest } = v;
  return rest;
}

/**
 * "Request the invoice": stored once per session while active (a second tap returns the same request), then delivered to
 * the cashier by the POS long poll. Allowed only when the invoice is current (see invoice.state) and the session is open.
 */
export async function requestInvoice(db: Db, token: string, ip: string, now = new Date()) {
  if (!rateLimit(`invreq:${ip}`, 6, 3)) throw tooMany();
  const view = await getSessionView(db, token, now);
  if (!view || view.gone) throw notFound("session_not_found");
  if (view.status === "closed") throw new AppError("session_closed", 409);
  if (view.invoice.state !== "ready") throw new AppError("invoice_not_ready", 409);
  const [table] = await db.select({ posUid: diningTables.posUid, number: diningTables.number }).from(diningTables)
    .innerJoin(tableSessions, eq(tableSessions.tableId, diningTables.id)).where(eq(tableSessions.id, view.id)).limit(1);
  const active = async () => (await db.select().from(invoiceRequests)
    .where(and(eq(invoiceRequests.sessionId, view.id), inArray(invoiceRequests.status, ACTIVE_REQUEST))).limit(1))[0];
  const existing = await active();
  if (existing) return { status: existing.status, duplicate: true };
  const [restaurant] = await db.select({ id: restaurants.id }).from(restaurants).innerJoin(tableSessions, eq(tableSessions.restaurantId, restaurants.id))
    .where(eq(tableSessions.id, view.id)).limit(1);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(invoiceRequests).values({ restaurantId: restaurant!.id, sessionId: view.id, tablePosUid: table!.posUid, tableNumber: table!.number, status: "pending", requestedAt: now });
      await bumpSession(tx as unknown as Db, view.id, true, now);
    });
  } catch (e) {
    const again = await active(); // two taps racing: the unique index lets one in
    if (again) return { status: again.status, duplicate: true };
    throw e;
  }
  notifySessions([view.id]);
  notify(channels.restaurantOrders(restaurant!.id));
  return { status: "pending", duplicate: false };
}

// ── POS side ───────────────────────────────────────────────────────────────

/** Invoice requests the POS has not stored yet. */
export async function pendingRequests(db: Db, restaurantId: string) {
  const rows = await db.select().from(invoiceRequests)
    .where(and(eq(invoiceRequests.restaurantId, restaurantId), eq(invoiceRequests.status, "pending"))).orderBy(asc(invoiceRequests.requestedAt)).limit(50);
  if (!rows.length) return [];
  const list = await db.select({ sessionId: orders.sessionId, number: orders.number, posOrderId: orders.posOrderId }).from(orders)
    .where(and(inArray(orders.sessionId, rows.map((r) => r.sessionId)), sql`${orders.invoice} is not null`));
  return rows.map((r) => ({
    id: r.id, tableUid: r.tablePosUid, tableNumber: r.tableNumber, requestedAt: r.requestedAt.toISOString(),
    orderNumbers: list.filter((o) => o.sessionId === r.sessionId).map((o) => o.number).sort((a, b) => a - b),
  }));
}

export async function ackRequests(db: Db, device: Device, ids: string[]) {
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.update(invoiceRequests).set({ status: "delivered", deliveredAt: now })
      .where(and(eq(invoiceRequests.restaurantId, device.restaurantId), inArray(invoiceRequests.id, ids), eq(invoiceRequests.status, "pending")))
      .returning({ id: invoiceRequests.id, sessionId: invoiceRequests.sessionId });
    for (const r of rows) await bumpSession(tx as unknown as Db, r.sessionId, false, now);
    return rows;
  });
  notifySessions(updated.map((u) => u.sessionId));
  await syncLog(db, device.restaurantId, device.id, "request_ack", true, `${updated.length}/${ids.length}`);
  return { acknowledged: updated.map((u) => u.id) };
}

export type RequestUpdate = { id: string; status: "acknowledged" | "printed" | "dismissed"; seq: number; at: Date };

/** The cashier's decision on a request. Per-request sequence numbers make retries and late updates harmless. */
export async function applyRequestStatuses(db: Db, device: Device, updates: RequestUpdate[]) {
  const applied: string[] = [];
  const touched: string[] = [];
  for (const u of updates) {
    const ok = await db.transaction(async (tx) => {
      const [r] = await tx.select().from(invoiceRequests).where(and(eq(invoiceRequests.id, u.id), eq(invoiceRequests.restaurantId, device.restaurantId))).limit(1).for("update");
      if (!r) return false;
      if (u.seq <= r.statusSeq) return true;
      await tx.update(invoiceRequests).set({ status: u.status, statusSeq: u.seq, handledAt: u.at, deliveredAt: r.deliveredAt ?? u.at }).where(eq(invoiceRequests.id, r.id));
      await bumpSession(tx as unknown as Db, r.sessionId, true);
      touched.push(r.sessionId);
      return true;
    });
    if (ok) applied.push(u.id);
  }
  notifySessions(touched);
  await syncLog(db, device.restaurantId, device.id, "request_status", true, `${applied.length}/${updates.length}`);
  return { applied };
}

/**
 * The cashier ended the table's session at the POS. Closes the table's open session unless it holds an order the POS has
 * not received yet — such an order was placed after the cashier's decision (e.g. while the POS was offline), so it belongs
 * to a new party that must not be closed. Clock-independent on purpose: a POS clock that is off never changes the outcome.
 * Idempotent: an already closed table is "applied".
 */
export async function closeTables(db: Db, device: Device, closes: { uid: string; closedAt: Date }[]) {
  const applied: string[] = [];
  const touched: string[] = [];
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, device.restaurantId)).limit(1);
  if (!r) return { applied };
  for (const c of closes) {
    const [t] = await db.select({ id: diningTables.id }).from(diningTables)
      .where(and(eq(diningTables.restaurantId, r.id), eq(diningTables.posUid, c.uid.toLowerCase()))).limit(1);
    if (!t) { applied.push(c.uid); continue; }
    await db.transaction(async (tx) => {
      const [open] = await tx.select().from(tableSessions).where(and(eq(tableSessions.tableId, t.id), isNull(tableSessions.closedAt))).limit(1).for("update");
      const [unseen] = open
        ? await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.sessionId, open.id), eq(orders.status, "submitted"))).limit(1)
        : [];
      if (open && !unseen) {
        // The display time counts from when the platform learns of it (server clock), never from the POS clock.
        await closeSession(tx as unknown as Db, open, r, "pos", new Date());
        touched.push(open.id);
      }
    });
    applied.push(c.uid);
  }
  notifySessions(touched);
  await syncLog(db, r.id, device.id, "tables_close", true, `${applied.length}/${closes.length}`);
  return { applied };
}

/** Order tracking links stop working with their session (closed + display time over). */
export async function sessionHidden(db: Db, sessionId: string | null, now = new Date()) {
  if (!sessionId) return false;
  const [s] = await db.select({ closedAt: tableSessions.closedAt, visibleUntil: tableSessions.visibleUntil }).from(tableSessions).where(eq(tableSessions.id, sessionId)).limit(1);
  return !!s?.closedAt && (!s.visibleUntil || s.visibleUntil <= now);
}

/** What the customer's page receives (the session id never leaves the server). */
export type PublicSession = Omit<SessionView, "id">;
