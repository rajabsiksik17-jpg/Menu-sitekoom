import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { invoiceRequests, orders, restaurants, tableSessions } from "@/db/schema";
import { ackOrders, applyStatuses, pendingOrders, waitForOrders } from "@/server/pos";
import { getTracking, submitOrder, type SubmitInput } from "@/server/orders";
import {
  ackRequests, applyRequestStatuses, closeTables, getSessionView, pendingRequests, requestInvoice, waitForSession, type SessionView,
} from "@/server/sessions";
import type { InvoicePayload } from "@/server/pos-schemas";
import { AppError } from "@/lib/errors";
import { freshDb, setupRestaurant, uid } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const key = () => crypto.randomUUID().replaceAll("-", "");
const order = (slug: string, tableToken: string, items: SubmitInput["items"] = [{ productId: 11, quantity: 1, modifierIds: [] }]): SubmitInput =>
  ({ slug, tableToken, idempotencyKey: key(), lang: "ar", items });

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function view(token: string, now?: Date) {
  const v = await getSessionView(db, token, now);
  if (!v || v.gone) throw new Error("session not visible");
  return v as SessionView;
}

/** The POS sends decimals (JOD); the platform stores fils. `minor` is the expected stored amount. */
const invoice = (saleId: number, minor: number): InvoicePayload => {
  const total = minor / 1000;
  return {
    saleId, number: `INV-${saleId}`, issuedAt: new Date(), cashier: "Sami", paymentMethod: "نقدي", taxNumber: null,
    lines: [{ name: "برجر دجاج", quantity: 1, unitPrice: total, discount: 0, total, options: [], note: null }],
    subtotal: total, discount: 0, tax: 0, total, paid: total,
  };
};

/** The cashier accepts: the POS sends the status with the sale it created. */
async function accept(device: Parameters<typeof applyStatuses>[1], orderId: string, saleId: number, total: number, seq = 1) {
  await applyStatuses(db, device, [{ id: orderId, status: "accepted", seq, at: new Date(), prepMinutes: 10, estimatedReadyAt: new Date(Date.now() + 600_000), invoice: invoice(saleId, total) }]);
}

async function idOf(number: number) {
  const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.number, number));
  return o!.id;
}

describe("table sessions", () => {
  it("the first order opens the table's session; the next orders of the table join it; a retry returns the same token", async () => {
    const { restaurant, tables } = await setupRestaurant(db);
    const input = order(restaurant.slug, tables[0]!.token);
    const a = await submitOrder(db, input, "1.1.1.1");
    expect(a.sessionToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const retry = await submitOrder(db, input, "1.1.1.1");
    expect(retry.duplicate).toBe(true);
    expect(retry.sessionToken).toBe(a.sessionToken);
    const b = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "2.2.2.2"); // a friend at the same table
    expect(b.sessionToken).toBe(a.sessionToken);
    const other = await submitOrder(db, order(restaurant.slug, tables[1]!.token), "3.3.3.3");
    expect(other.sessionToken).not.toBe(a.sessionToken); // another table, another session
    const v = await view(a.sessionToken!);
    expect(v.orders.map((o) => o.number)).toEqual([b.number, a.number]); // newest first, only this table
    expect(v.table.number).toBe(tables[0]!.number);
    expect(v).not.toHaveProperty("restaurantId");
  });

  it("shows the invoice only when it is current: held back while a newer order waits for the cashier", async () => {
    const { restaurant, tables, device } = await setupRestaurant(db);
    const a = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "ip");
    expect((await view(a.sessionToken!)).invoice.state).toBe("waiting");
    await ackOrders(db, device, [await idOf(a.number)]);
    await accept(device, await idOf(a.number), 501, 3000);
    let v = await view(a.sessionToken!);
    expect(v.invoice).toEqual({ state: "ready", count: 1, total: 3000, paid: 3000 });
    expect(v.orders[0]!.invoice!.number).toBe("INV-501");

    const b = await submitOrder(db, order(restaurant.slug, tables[0]!.token, [{ productId: 12, variantId: 502, quantity: 2, modifierIds: [] }]), "ip");
    v = await view(a.sessionToken!);
    expect(v.invoice.state).toBe("updating"); // the previous total would be misleading now
    await expectCode(requestInvoice(db, a.sessionToken!, "ip"), "invoice_not_ready");
    await accept(device, await idOf(b.number), 502, 3000);
    v = await view(a.sessionToken!);
    expect(v.invoice).toEqual({ state: "ready", count: 2, total: 6000, paid: 6000 });
    // A rejected order never counts.
    const c = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "ip");
    await applyStatuses(db, device, [{ id: await idOf(c.number), status: "rejected", seq: 1, at: new Date(), reason: "x" }]);
    expect((await view(a.sessionToken!)).invoice).toMatchObject({ state: "ready", total: 6000 });
  });

  it("an invoice request is stored once, reaches the POS once, and follows the cashier's decision", async () => {
    const { restaurant, tables, device } = await setupRestaurant(db);
    const a = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "ip");
    await accept(device, await idOf(a.number), 601, 3000);
    const before = (await view(a.sessionToken!)).customerVersion;
    expect(await requestInvoice(db, a.sessionToken!, "ip")).toEqual({ status: "pending", duplicate: false });
    expect(await requestInvoice(db, a.sessionToken!, "ip")).toEqual({ status: "pending", duplicate: true }); // second tap
    expect((await view(a.sessionToken!)).customerVersion).toBe(before + 1);

    const delivered = await waitForOrders(db, restaurant.id, 0);
    expect(delivered.requests).toHaveLength(1);
    expect(delivered.requests[0]).toMatchObject({ tableUid: tables[0]!.uid, orderNumbers: [a.number] });
    const id = delivered.requests[0]!.id;
    await ackRequests(db, device, [id]);
    expect(await pendingRequests(db, restaurant.id)).toHaveLength(0); // never re-sent
    expect((await view(a.sessionToken!)).request?.status).toBe("delivered");

    await applyRequestStatuses(db, device, [{ id, status: "printed", seq: 2, at: new Date() }]);
    await applyRequestStatuses(db, device, [{ id, status: "acknowledged", seq: 1, at: new Date() }]); // late, older: ignored
    expect((await view(a.sessionToken!)).request?.status).toBe("printed");
    // Handled: the customer may ask again (a new request).
    expect(await requestInvoice(db, a.sessionToken!, "ip")).toEqual({ status: "pending", duplicate: false });
    expect(await db.select().from(invoiceRequests)).toHaveLength(2);
  });

  it("ending the session at the POS closes the view, keeps the invoice for the configured time, then the token stops working", async () => {
    const { restaurant, tables, device } = await setupRestaurant(db);
    await db.update(restaurants).set({ invoiceVisibleMinutes: 10 }).where(eq(restaurants.id, restaurant.id));
    const a = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "ip");
    await accept(device, await idOf(a.number), 701, 3000);
    const closedAt = new Date();
    expect(await closeTables(db, device, [{ uid: tables[0]!.uid.toUpperCase(), closedAt }])).toEqual({ applied: [tables[0]!.uid.toUpperCase()] });
    const v = await view(a.sessionToken!);
    expect(v.status).toBe("closed");
    expect(v.invoice.state).toBe("ready"); // the final invoice is still visible
    expect(Math.abs(new Date(v.visibleUntil!).getTime() - (closedAt.getTime() + 10 * 60_000))).toBeLessThan(5000);
    await expectCode(requestInvoice(db, a.sessionToken!, "ip"), "session_closed");
    expect(await closeTables(db, device, [{ uid: tables[0]!.uid, closedAt }])).toEqual({ applied: [tables[0]!.uid] }); // idempotent

    const later = new Date(closedAt.getTime() + 11 * 60_000);
    expect(await getSessionView(db, a.sessionToken!, later)).toEqual({ gone: true });
    const [o] = await db.select().from(orders);
    expect(await getTracking(db, o!.trackingToken, later)).toBeNull(); // tracking link ends with the session
    expect(await db.select().from(orders)).toHaveLength(1); // nothing deleted
    expect(o!.invoice?.number).toBe("INV-701");

    // The next party at the table gets a clean session.
    const next = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "ip");
    expect(next.sessionToken).not.toBe(a.sessionToken);
    const nv = await view(next.sessionToken!);
    expect(nv.orders.map((x) => x.number)).toEqual([next.number]);
    expect(nv.invoice.state).toBe("waiting");
  });

  it("a close decided before the POS saw an order never ends that (newer) party's session — whatever the POS clock says", async () => {
    const { restaurant, tables, device } = await setupRestaurant(db);
    const a = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "ip"); // not yet received by the POS
    await closeTables(db, device, [{ uid: tables[0]!.uid, closedAt: new Date(Date.now() + 3600_000) }]);
    expect((await view(a.sessionToken!)).status).toBe("open");
    await ackOrders(db, device, [await idOf(a.number)]); // now the cashier has it
    await closeTables(db, device, [{ uid: tables[0]!.uid, closedAt: new Date(Date.now() - 86_400_000) }]); // POS clock a day behind
    expect((await view(a.sessionToken!)).status).toBe("closed");
  });

  it("an idle session closes by itself only when nothing is waiting or being prepared", async () => {
    const { restaurant, tables, device } = await setupRestaurant(db);
    const a = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "ip");
    const late = new Date(Date.now() + 5 * 3600_000); // default idle time: 240 min
    expect((await view(a.sessionToken!, late)).status).toBe("open"); // the order still waits for the cashier
    await applyStatuses(db, device, [{ id: await idOf(a.number), status: "completed", seq: 1, at: new Date(), invoice: invoice(801, 3000) }]);
    await db.update(tableSessions).set({ lastActivityAt: new Date(Date.now() - 5 * 3600_000) });
    const v = await getSessionView(db, a.sessionToken!, new Date());
    expect(v && !v.gone && v.status).toBe("closed");
    const next = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "ip");
    expect(next.sessionToken).not.toBe(a.sessionToken);
  });

  it("long polling answers as soon as the session changes", async () => {
    const { restaurant, tables, device } = await setupRestaurant(db);
    const a = await submitOrder(db, order(restaurant.slug, tables[0]!.token), "ip");
    const v0 = await view(a.sessionToken!);
    const started = Date.now();
    const waiting = waitForSession(db, a.sessionToken!, v0.version, 10_000);
    setTimeout(() => void idOf(a.number).then((id) => accept(device, id, 901, 3000)), 200);
    const changed = await waiting;
    expect(changed && !changed.gone && changed.version).toBeGreaterThan(v0.version);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("a device only reaches its own restaurant's requests and tables", async () => {
    const one = await setupRestaurant(db, "one", "ONE-1");
    const two = await setupRestaurant(db, "two", "TWO-2");
    const a = await submitOrder(db, order("one", one.tables[0]!.token), "ip");
    await accept(one.device, await idOf(a.number), 1001, 3000);
    await requestInvoice(db, a.sessionToken!, "ip");
    const [req] = await pendingRequests(db, one.restaurant.id);
    expect(await pendingRequests(db, two.restaurant.id)).toHaveLength(0);
    expect(await ackRequests(db, two.device, [req!.id])).toEqual({ acknowledged: [] });
    expect(await applyRequestStatuses(db, two.device, [{ id: req!.id, status: "dismissed", seq: 5, at: new Date() }])).toEqual({ applied: [] });
    await closeTables(db, two.device, [{ uid: one.tables[0]!.uid, closedAt: new Date() }]); // not its table
    expect((await view(a.sessionToken!)).status).toBe("open");
    expect((await view(a.sessionToken!)).request?.status).toBe("pending");
    expect(await pendingOrders(db, two.restaurant.id)).toHaveLength(0);
    expect(uid(1, "one")).not.toBe(uid(1, "two"));
  });
});
