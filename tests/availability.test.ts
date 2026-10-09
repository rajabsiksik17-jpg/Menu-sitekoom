import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { syncMenu } from "@/server/pos";
import { loadPublicMenu } from "@/server/menu";
import { submitOrder } from "@/server/orders";
import { AppError } from "@/lib/errors";
import { freshDb, sampleMenu, setupRestaurant } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("sold out from the cashier", () => {
  it("is unavailable until its time (shown to the customer, orders refused), then available by itself", async () => {
    const { restaurant, device, tables } = await setupRestaurant(db);
    const back = new Date(Date.now() + 30 * 60_000);
    const menu = sampleMenu();
    menu.hash = "h2";
    menu.products = menu.products.map((p) => (p.id === 11 ? { ...p, available: false, availableAt: back } : p));
    await syncMenu(db, device, menu);

    const now = await loadPublicMenu(db, restaurant.slug, null);
    const chicken = now!.products.find((p) => p.id === 11)!;
    expect(chicken.available).toBe(false);
    expect(chicken.availableAt).toBe(back.toISOString());
    const order = { slug: restaurant.slug, tableToken: tables[0]!.token, lang: "ar" as const, items: [{ productId: 11, quantity: 1, modifierIds: [] }] };
    await expect(submitOrder(db, { ...order, idempotencyKey: crypto.randomUUID().replaceAll("-", "") }, "ip"))
      .rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === "product_unavailable");

    const later = await loadPublicMenu(db, restaurant.slug, null, new Date(back.getTime() + 1000));
    const again = later!.products.find((p) => p.id === 11)!;
    expect(again.available).toBe(true);
    expect(again.availableAt).toBeNull();
  });

  it("sold out without a time stays unavailable until the POS makes it available", async () => {
    const { restaurant, device } = await setupRestaurant(db);
    const menu = sampleMenu();
    menu.hash = "h3";
    menu.products = menu.products.map((p) => (p.id === 11 ? { ...p, available: false, availableAt: null } : p));
    await syncMenu(db, device, menu);
    const far = await loadPublicMenu(db, restaurant.slug, null, new Date(Date.now() + 7 * 86_400_000));
    expect(far!.products.find((p) => p.id === 11)).toMatchObject({ available: false, availableAt: null });
  });
});
