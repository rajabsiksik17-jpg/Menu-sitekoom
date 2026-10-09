import { beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { Db } from "@/db";
import { promotions } from "@/db/schema";
import { createRestaurant, listPromotions, savePromotion, updateGeo, updateService } from "@/server/admin";
import { loadPublicMenu } from "@/server/menu";
import { storeImage } from "@/lib/media";
import { AppError } from "@/lib/errors";
import { zonedToUtc } from "@/lib/time";
import { admin, freshDb } from "./helpers";

process.env.DATA_DIR = path.join(os.tmpdir(), `menu-test-${process.pid}`);

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return e instanceof AppError ? e.code : String(e); }
};

describe("dashboard rules", () => {
  it("rejects slugs that are reserved or taken", async () => {
    await createRestaurant(db, { slug: "pizza", nameAr: "بيتزا" }, admin);
    expect(await code(createRestaurant(db, { slug: "pizza", nameAr: "x" }, admin))).toBe("slug_taken");
    expect(await code(createRestaurant(db, { slug: "admin", nameAr: "x" }, admin))).toBe("slug_reserved");
    expect(await code(createRestaurant(db, { slug: "Bad Slug!", nameAr: "x" }, admin))).not.toBe("ok");
  });

  it("enabling the geofence requires a complete area", async () => {
    const r = await createRestaurant(db, { slug: "geo", nameAr: "x" }, admin);
    const base = { geoEnabled: true, lat: null, lng: null, geoMode: "radius" as const, radiusM: 80, polygon: null, maxAccuracyM: 100 };
    expect(await code(updateGeo(db, r.id, base, admin))).toBe("geo_incomplete");
    expect(await code(updateGeo(db, r.id, { ...base, geoMode: "polygon", polygon: [[31.95, 35.91], [31.951, 35.91]] }, admin))).toBe("geo_invalid_polygon");
    expect(await code(updateGeo(db, r.id, { ...base, lat: 31.95, lng: 35.91 }, admin))).toBe("ok");
  });

  it("only real images are stored, re-encoded and deduplicated", async () => {
    const r = await createRestaurant(db, { slug: "img", nameAr: "x" }, admin);
    expect(await code(storeImage(db, r.id, Buffer.from("<script>alert(1)</script>"), "admin"))).toBe("image_invalid");
    const png = await sharp({ create: { width: 1800, height: 900, channels: 3, background: "#c2410c" } }).png().toBuffer();
    const a = await storeImage(db, r.id, png, "admin");
    const b = await storeImage(db, r.id, png, "admin");
    expect(a.id).toBe(b.id);
    expect(a.mime).toBe("image/webp");
    expect(a.width).toBe(1400); // resized for mobile delivery
  });

  it("banners need an image, valid dates in the restaurant time zone, and appear only while scheduled", async () => {
    const r = await createRestaurant(db, { slug: "promo", nameAr: "x" }, admin);
    await updateService(db, r.id, { status: "active", serviceExpiresAt: "", orderingPaused: false }, admin);
    const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#123456" } }).png().toBuffer();
    const img = await storeImage(db, r.id, png, "admin");
    const input = { titleAr: "عرض", ctaTarget: "category:1", isActive: true, startsAt: "2026-10-10T09:00", endsAt: "2026-10-01T09:00" };
    expect(await code(savePromotion(db, r.id, null, { ...input, endsAt: "" }, {}, admin))).toBe("promotion_image_required");
    expect(await code(savePromotion(db, r.id, null, input, { image: img.id }, admin))).toBe("promotion_dates");
    expect(await code(savePromotion(db, r.id, null, { ...input, ctaTarget: "javascript:alert(1)" }, { image: img.id }, admin))).not.toBe("ok");
    await savePromotion(db, r.id, null, { ...input, endsAt: "2026-10-20T23:00" }, { image: img.id }, admin);
    const [p] = await listPromotions(db, r.id);
    expect(p!.startsAt!.toISOString()).toBe("2026-10-10T06:00:00.000Z"); // 09:00 in Amman (UTC+3)
    expect((await loadPublicMenu(db, "promo", null, new Date("2026-10-05T12:00:00Z")))!.promotions).toHaveLength(0);
    expect((await loadPublicMenu(db, "promo", null, new Date("2026-10-15T12:00:00Z")))!.promotions).toHaveLength(1);
    await db.update(promotions).set({ isActive: false });
    expect((await loadPublicMenu(db, "promo", null, new Date("2026-10-15T12:00:00Z")))!.promotions).toHaveLength(0);
  });

  it("converts local times across zones", () => {
    expect(zonedToUtc("2026-12-31T23:59:59", "Asia/Amman")!.toISOString()).toBe("2026-12-31T20:59:59.000Z");
    expect(zonedToUtc("2026-07-01", "Europe/London")!.toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(zonedToUtc("bad", "Asia/Amman")).toBeNull();
  });
});
