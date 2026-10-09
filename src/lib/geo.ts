import type { Polygon } from "@/db/schema";

/**
 * Geofence for table orders. Browser coordinates are a usability control, not proof of presence: they can be spoofed.
 * The server re-checks every submission (inside the area, accuracy good enough, reading fresh) — see docs/SECURITY.md.
 */

export type GeoArea = { mode: string; lat: number | null; lng: number | null; radiusM: number; polygon: Polygon | null; maxAccuracyM: number };
export type GeoReading = { lat: number; lng: number; accuracy: number; capturedAt?: number };
export type GeoVerdict =
  | { ok: true; distanceM: number | null }
  | { ok: false; reason: "not_configured" | "invalid" | "inaccurate" | "stale" | "outside"; distanceM: number | null };

const R = 6371008.8; // mean Earth radius, metres

export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ray casting on a small area (planar approximation is exact enough for a restaurant-sized polygon). */
export function insidePolygon(lat: number, lng: number, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]!;
    const [yj, xj] = polygon[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Shortest distance from a point to the polygon edges (0 when inside). */
function distanceToPolygonM(lat: number, lng: number, polygon: Polygon): number {
  if (insidePolygon(lat, lng, polygon)) return 0;
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [aLat, aLng] = polygon[j]!;
    const [bLat, bLng] = polygon[i]!;
    // project in a local equirectangular frame (metres)
    const kx = Math.cos((lat * Math.PI) / 180) * 111320;
    const ky = 110540;
    const ax = (aLng - lng) * kx, ay = (aLat - lat) * ky, bx = (bLng - lng) * kx, by = (bLat - lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function validPolygon(p: unknown): p is Polygon {
  return Array.isArray(p) && p.length >= 3 && p.length <= 200 &&
    p.every((pt) => Array.isArray(pt) && pt.length === 2 && validLat(pt[0]) && validLng(pt[1]));
}

export const validLat = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
export const validLng = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;

/** Is the area configured well enough to enforce? */
export function areaReady(a: GeoArea): boolean {
  if (a.mode === "polygon") return validPolygon(a.polygon);
  return validLat(a.lat) && validLng(a.lng) && a.radiusM >= 10 && a.radiusM <= 5000;
}

/**
 * The decision. A reading must be inside the area, with an accuracy radius no larger than the configured maximum,
 * and (when the time is given) captured within the last two minutes. Unknown is never treated as inside.
 */
export function checkLocation(area: GeoArea, r: GeoReading | null | undefined, nowMs = Date.now()): GeoVerdict {
  if (!areaReady(area)) return { ok: false, reason: "not_configured", distanceM: null };
  if (!r || !validLat(r.lat) || !validLng(r.lng) || typeof r.accuracy !== "number" || !Number.isFinite(r.accuracy) || r.accuracy < 0)
    return { ok: false, reason: "invalid", distanceM: null };
  if (r.capturedAt !== undefined && (nowMs - r.capturedAt > 120_000 || r.capturedAt - nowMs > 30_000))
    return { ok: false, reason: "stale", distanceM: null };
  const distanceM = area.mode === "polygon"
    ? Math.round(distanceToPolygonM(r.lat, r.lng, area.polygon!))
    : Math.round(Math.max(0, haversineM(area.lat!, area.lng!, r.lat, r.lng) - area.radiusM));
  if (r.accuracy > area.maxAccuracyM) return { ok: false, reason: "inaccurate", distanceM };
  // Inside means the reported point itself is inside the area; a large accuracy circle never counts as "inside".
  if (distanceM > 0) return { ok: false, reason: "outside", distanceM };
  return { ok: true, distanceM };
}
