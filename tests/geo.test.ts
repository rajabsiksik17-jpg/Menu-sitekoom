import { describe, expect, it } from "vitest";
import { checkLocation, haversineM, insidePolygon } from "@/lib/geo";
import { withinHours } from "@/server/entitlement";

const center = { lat: 31.9539, lng: 35.9106 };
const radius = { mode: "radius", lat: center.lat, lng: center.lng, radiusM: 50, polygon: null, maxAccuracyM: 100 };
// ~100 m square around the centre
const square: [number, number][] = [[31.9535, 35.9101], [31.9535, 35.9111], [31.9544, 35.9111], [31.9544, 35.9101]];
const polygon = { mode: "polygon", lat: null, lng: null, radiusM: 50, polygon: square, maxAccuracyM: 100 };

describe("geofence", () => {
  it("measures distances", () => {
    expect(Math.round(haversineM(31.9539, 35.9106, 31.9548, 35.9106))).toBe(100);
  });

  it("radius: inside, outside, inaccurate, stale, invalid", () => {
    const now = Date.now();
    expect(checkLocation(radius, { lat: center.lat, lng: center.lng, accuracy: 20, capturedAt: now }, now)).toMatchObject({ ok: true });
    expect(checkLocation(radius, { lat: center.lat + 0.002, lng: center.lng, accuracy: 20 }, now)).toMatchObject({ ok: false, reason: "outside" });
    expect(checkLocation(radius, { lat: center.lat, lng: center.lng, accuracy: 300 }, now)).toMatchObject({ ok: false, reason: "inaccurate" });
    expect(checkLocation(radius, { lat: center.lat, lng: center.lng, accuracy: 10, capturedAt: now - 5 * 60_000 }, now)).toMatchObject({ ok: false, reason: "stale" });
    expect(checkLocation(radius, null, now)).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkLocation(radius, { lat: 200, lng: 0, accuracy: 1 }, now)).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkLocation({ ...radius, lat: null }, { lat: 1, lng: 1, accuracy: 1 }, now)).toMatchObject({ ok: false, reason: "not_configured" });
  });

  it("polygon: inside and outside with distance", () => {
    expect(insidePolygon(center.lat, center.lng, square)).toBe(true);
    expect(checkLocation(polygon, { lat: center.lat, lng: center.lng, accuracy: 10 })).toMatchObject({ ok: true });
    const outside = checkLocation(polygon, { lat: 31.9560, lng: center.lng, accuracy: 10 });
    expect(outside).toMatchObject({ ok: false, reason: "outside" });
    expect(outside.distanceM!).toBeGreaterThan(150);
  });
});

describe("opening hours", () => {
  it("handles ordinary and past-midnight hours in the restaurant time zone", () => {
    // 2026-10-09 is a Friday (5). 20:00 in Amman = 17:00 UTC.
    const fri20 = new Date("2026-10-09T17:00:00Z");
    expect(withinHours([{ day: 5, open: "12:00", close: "23:00" }], "Asia/Amman", fri20)).toBe(true);
    expect(withinHours([{ day: 5, open: "08:00", close: "12:00" }], "Asia/Amman", fri20)).toBe(false);
    const sat01 = new Date("2026-10-09T22:00:00Z"); // Saturday 01:00 local
    expect(withinHours([{ day: 5, open: "18:00", close: "02:00" }], "Asia/Amman", sat01)).toBe(true);
  });
});
