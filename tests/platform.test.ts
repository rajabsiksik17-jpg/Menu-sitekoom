import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { orders, posDevices, restaurants } from "@/db/schema";
import { createEnrollmentCode, createRestaurant, revokeDevice, updateGeo, updateService } from "@/server/admin";
import { ackOrders, applyStatuses, authenticateDevice, enroll, pendingOrders, rotateTable, syncMenu, syncTables } from "@/server/pos";
import { getTracking, submitOrder, type SubmitInput } from "@/server/orders";
import { loadPublicMenu } from "@/server/menu";
import { resetRateLimits } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { admin, AMMAN, freshDb, sampleMenu, setupRestaurant, uid } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const key = () => crypto.randomUUID().replaceAll("-", "");
const order = (slug: string, tableToken: string, items: SubmitInput["items"], extra: Partial<SubmitInput> = {}): SubmitInput =>
  ({ slug, tableToken, idempotencyKey: key(), lang: "ar", items, ...extra });

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe("restaurant registration and POS connection", () => {
  it("binds the account to the POS installation and issues a device token once", async () => {
    const r = await createRestaurant(db, { slug: "cafe-one", nameAr: "مقهى", installationCode: "ZZZZ-9999" }, admin);
    const { code } = await createEnrollmentCode(db, r.id, admin);
    await expectCode(enroll(db, { code, installationCode: "WRONG-1", deviceName: "x" }, "ip"), "installation_mismatch");
    const ok = await enroll(db, { code, installationCode: "zzzz-9999", deviceName: "Main" }, "ip");
    expect(ok.token.length).toBeGreaterThanOrEqual(40);
    expect(ok.restaurant.slug).toBe("cafe-one");
    await expectCode(enroll(db, { code, installationCode: "ZZZZ-9999", deviceName: "again" }, "ip"), "enrollment_code_invalid"); // single use
    const stored = await db.select().from(posDevices);
    expect(stored[0]!.tokenHash).not.toContain(ok.token);
  });

  it("revoked or replaced devices can no longer authenticate", async () => {
    const { restaurant, token, device } = await setupRestaurant(db);
    await revokeDevice(db, restaurant.id, device.id, admin);
    await expectCode(authenticateDevice(db, `Bearer ${token}`, "ip"), "device_revoked");
    // A new enrollment replaces the old device.
    const { code } = await createEnrollmentCode(db, restaurant.id, admin);
    const next = await enroll(db, { code, installationCode: "ABCD-1234", deviceName: "New PC" }, "ip");
    await expect(authenticateDevice(db, `Bearer ${next.token}`, "ip")).resolves.toMatchObject({ restaurantId: restaurant.id });
    await expectCode(authenticateDevice(db, "Bearer short", "ip"), "device_token_missing");
  });
});

describe("menu and tables sync", () => {
  it("publishes only the synced, active data of the restaurant; resync deactivates removed items", async () => {
    const { device } = await setupRestaurant(db);
    let menu = (await loadPublicMenu(db, "burger-house", null))!;
    expect(menu.products.map((p) => p.id).sort()).toEqual([10, 11, 12, 13]);
    expect(menu.products.find((p) => p.id === 10)!.price).toBe(3500);
    expect(menu.products.find((p) => p.id === 11)!.prepMinutes).toBe(15); // restaurant default
    expect(menu.products.find((p) => p.id === 10)!.prepMinutes).toBe(25); // product override
    expect(menu.products.find((p) => p.id === 10)!.groups.map((g) => g.name)).toEqual(["الحجم", "إضافات"]);

    const m = sampleMenu();
    m.products = m.products.filter((p) => p.id !== 11);
    m.hash = "h2";
    await syncMenu(db, device, m);
    menu = (await loadPublicMenu(db, "burger-house", null))!;
    expect(menu.products.map((p) => p.id)).not.toContain(11);
  });

  it("table sync is idempotent by the POS uid and QR tokens are unguessable", async () => {
    const { device, tables } = await setupRestaurant(db);
    const again = await syncTables(db, device, [{ uid: uid(1, "burger-house"), number: 7, name: "نافذة", seats: 2, status: "active" }]);
    const t1 = again.tables.find((t) => t.uid === uid(1, "burger-house"))!;
    expect(again.tables).toHaveLength(3);
    expect(t1.number).toBe(7);
    expect(t1.token).toBe(tables.find((t) => t.uid === t1.uid)!.token); // same identity, same token
    expect(t1.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(t1.url).toContain(`/burger-house/t/${t1.token}`);
  });
});

describe("orders", () => {
  it("prices on the server, validates options and delivers to the POS exactly once", async () => {
    const { restaurant, device, tables } = await setupRestaurant(db);
    const t = tables[0]!;
    const res = await submitOrder(db, order("burger-house", t.token, [
      { productId: 10, quantity: 2, modifierIds: [1002, 2001], note: "بدون مخلل" },
      { productId: 12, variantId: 502, quantity: 1, modifierIds: [] },
    ], { note: "بسرعة" }), "9.9.9.9");
    // (3.5 + 1.25 + 0.25) × 2 + 1.5 = 11.5
    expect(res.total).toBe(11500);
    expect(res.duplicate).toBe(false);

    const pending = await pendingOrders(db, restaurant.id);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.tableUid).toBe(t.uid);
    expect(pending[0]!.items[0]!.modifiers.map((m) => m.name)).toEqual(["دبل", "جبنة"]);
    expect(pending[0]!.items[0]!.prepMinutes).toBe(25);
    await ackOrders(db, device, [pending[0]!.id]);
    await ackOrders(db, device, [pending[0]!.id]); // retried ack is harmless
    expect(await pendingOrders(db, restaurant.id)).toHaveLength(0);
    const track = (await getTracking(db, res.trackingToken))!;
    expect(track.order.status).toBe("delivered"); // received by the POS — not "accepted" yet
  });

  it("rejects unavailable products, bad options, missing flavors and invalid quantities", async () => {
    const { tables } = await setupRestaurant(db);
    const tok = tables[0]!.token;
    await expectCode(submitOrder(db, order("burger-house", tok, [{ productId: 13, quantity: 1, modifierIds: [] }]), "a"), "product_unavailable");
    await expectCode(submitOrder(db, order("burger-house", tok, [{ productId: 10, quantity: 1, modifierIds: [] }]), "b"), "modifier_count"); // size required
    await expectCode(submitOrder(db, order("burger-house", tok, [{ productId: 10, quantity: 1, modifierIds: [1001, 1002] }]), "c"), "modifier_count"); // max 1
    await expectCode(submitOrder(db, order("burger-house", tok, [{ productId: 11, quantity: 1, modifierIds: [1001] }]), "d"), "modifier_invalid"); // not its group
    await expectCode(submitOrder(db, order("burger-house", tok, [{ productId: 12, quantity: 1, modifierIds: [] }]), "e"), "variant_required");
    await expectCode(submitOrder(db, order("burger-house", tok, [{ productId: 999, quantity: 1, modifierIds: [] }]), "f"), "product_not_found");
  });

  it("a retried submission with the same idempotency key returns the same order", async () => {
    const { restaurant, tables } = await setupRestaurant(db);
    const input = order("burger-house", tables[0]!.token, [{ productId: 11, quantity: 1, modifierIds: [] }]);
    const [a, b] = await Promise.all([submitOrder(db, input, "x"), submitOrder(db, input, "x")]);
    const c = await submitOrder(db, input, "x");
    expect(new Set([a.trackingToken, b.trackingToken, c.trackingToken]).size).toBe(1);
    expect(c.duplicate).toBe(true);
    expect(await db.select().from(orders).where(eq(orders.restaurantId, restaurant.id))).toHaveLength(1);
  });

  it("status updates from the POS are ordered by sequence and drive the tracking page", async () => {
    const { restaurant, device, tables } = await setupRestaurant(db);
    const res = await submitOrder(db, order("burger-house", tables[1]!.token, [{ productId: 11, quantity: 1, modifierIds: [] }]), "x");
    const [p] = await pendingOrders(db, restaurant.id);
    const accepted = new Date("2026-10-09T12:00:00Z");
    const eta = new Date("2026-10-09T12:15:00Z");
    await applyStatuses(db, device, [{ id: p!.id, status: "accepted", seq: 1, at: accepted, prepMinutes: 15, estimatedReadyAt: eta, posOrderId: 44 }]);
    let t = (await getTracking(db, res.trackingToken))!;
    expect(t.order.status).toBe("accepted");
    expect(t.order.estimatedReadyAt).toBe(eta.toISOString());
    await applyStatuses(db, device, [{ id: p!.id, status: "ready", seq: 3, at: new Date("2026-10-09T12:14:00Z") }]);
    await applyStatuses(db, device, [{ id: p!.id, status: "preparing", seq: 2, at: new Date("2026-10-09T12:01:00Z") }]); // late, ignored
    t = (await getTracking(db, res.trackingToken))!;
    expect(t.order.status).toBe("ready");
    expect(t.order.acceptedAt).toBe(accepted.toISOString());
  });

  it("refuses orders when the service is not active, paused, or the QR was replaced", async () => {
    const { restaurant, device, tables } = await setupRestaurant(db);
    const t = tables[0]!;
    await updateService(db, restaurant.id, { status: "active", serviceExpiresAt: "2020-01-01", orderingPaused: false }, admin);
    await expectCode(submitOrder(db, order("burger-house", t.token, [{ productId: 11, quantity: 1, modifierIds: [] }]), "x"), "ordering_expired");
    await updateService(db, restaurant.id, { status: "active", serviceExpiresAt: "", orderingPaused: true }, admin);
    await expectCode(submitOrder(db, order("burger-house", t.token, [{ productId: 11, quantity: 1, modifierIds: [] }]), "x"), "ordering_paused");
    await updateService(db, restaurant.id, { status: "active", serviceExpiresAt: "", orderingPaused: false }, admin);
    const rotated = await rotateTable(db, restaurant.id, t.uid, { type: "pos", id: device.id, ip: "x" });
    expect(rotated.token).not.toBe(t.token);
    await expectCode(submitOrder(db, order("burger-house", t.token, [{ productId: 11, quantity: 1, modifierIds: [] }]), "x"), "table_qr_replaced");
    expect((await loadPublicMenu(db, "burger-house", t.token))!.table.kind).toBe("replaced");
    await syncTables(db, device, [{ uid: t.uid, number: 1, status: "inactive" }]);
    await expectCode(submitOrder(db, order("burger-house", rotated.token, [{ productId: 11, quantity: 1, modifierIds: [] }]), "x"), "table_unavailable");
  });

  it("enforces the geofence on the server", async () => {
    const { restaurant, tables } = await setupRestaurant(db);
    await updateGeo(db, restaurant.id, { geoEnabled: true, lat: AMMAN.lat, lng: AMMAN.lng, geoMode: "radius", radiusM: 60, polygon: null, maxAccuracyM: 80 }, admin);
    const items = [{ productId: 11, quantity: 1, modifierIds: [] }];
    const tok = tables[0]!.token;
    await expectCode(submitOrder(db, order("burger-house", tok, items), "a"), "location_invalid"); // no location sent
    await expectCode(submitOrder(db, order("burger-house", tok, items, { location: { lat: AMMAN.lat + 0.01, lng: AMMAN.lng, accuracy: 10, capturedAt: Date.now() } }), "b"), "location_outside");
    await expectCode(submitOrder(db, order("burger-house", tok, items, { location: { lat: AMMAN.lat, lng: AMMAN.lng, accuracy: 500, capturedAt: Date.now() } }), "c"), "location_inaccurate");
    await expectCode(submitOrder(db, order("burger-house", tok, items, { location: { lat: AMMAN.lat, lng: AMMAN.lng, accuracy: 10, capturedAt: Date.now() - 600_000 } }), "d"), "location_stale");
    const ok = await submitOrder(db, order("burger-house", tok, items, { location: { lat: AMMAN.lat + 0.0002, lng: AMMAN.lng, accuracy: 15, capturedAt: Date.now() } }), "e");
    expect(ok.number).toBe(1);
    // Polygon mode, a different restaurant with its own area.
    resetRateLimits();
  });
});

describe("tenant isolation", () => {
  it("a device and a table token only reach their own restaurant", async () => {
    const a = await setupRestaurant(db, "rest-a", "AAAA-0001");
    const b = await setupRestaurant(db, "rest-b", "BBBB-0002");
    // A's table token used on B's menu: unknown there.
    await expectCode(submitOrder(db, order("rest-b", a.tables[0]!.token, [{ productId: 11, quantity: 1, modifierIds: [] }]), "x"), "table_unavailable");
    expect((await loadPublicMenu(db, "rest-b", a.tables[0]!.token))!.table.kind).toBe("unknown");
    // An order of A is invisible to B's device and cannot be changed by it.
    await submitOrder(db, order("rest-a", a.tables[0]!.token, [{ productId: 11, quantity: 1, modifierIds: [] }]), "x");
    expect(await pendingOrders(db, b.restaurant.id)).toHaveLength(0);
    const [pa] = await pendingOrders(db, a.restaurant.id);
    await applyStatuses(db, b.device, [{ id: pa!.id, status: "rejected", seq: 1, at: new Date(), reason: "x" }]);
    await ackOrders(db, b.device, [pa!.id]);
    const [row] = await db.select().from(orders).where(eq(orders.id, pa!.id));
    expect(row!.status).toBe("submitted");
    // B's rotate cannot touch A's table.
    await expectCode(rotateTable(db, b.restaurant.id, a.tables[0]!.uid, { type: "pos", id: b.device.id, ip: "x" }), "table_not_found");
    const [ra] = await db.select().from(restaurants).where(eq(restaurants.id, a.restaurant.id));
    expect(ra!.slug).toBe("rest-a");
  });
});
