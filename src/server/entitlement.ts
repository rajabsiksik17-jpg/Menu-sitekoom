import type { restaurants } from "@/db/schema";

type R = Pick<typeof restaurants.$inferSelect, "status" | "serviceExpiresAt" | "orderingPaused">;

export type ServiceState = { active: boolean; reason: "active" | "draft" | "suspended" | "expired"; expiresAt: string | null };

/**
 * Online-ordering entitlement, separate from the offline POS license. Policy when it is not active: the public menu
 * can still be browsed (for an expired service it shows "ordering unavailable"), new orders are refused, and the POS
 * keeps working normally — nothing local ever depends on this.
 */
export function serviceState(r: R, now = new Date()): ServiceState {
  const expiresAt = r.serviceExpiresAt?.toISOString() ?? null;
  if (r.status === "suspended") return { active: false, reason: "suspended", expiresAt };
  if (r.status !== "active") return { active: false, reason: "draft", expiresAt };
  if (r.serviceExpiresAt && r.serviceExpiresAt.getTime() <= now.getTime()) return { active: false, reason: "expired", expiresAt };
  return { active: true, reason: "active", expiresAt };
}

/** Ordering is open: service active, not paused by the restaurant, and (when hours are set) within opening hours. */
export function orderingOpen(r: R & { openingHours: { day: number; open: string; close: string }[] | null; timezone: string }, now = new Date()) {
  const s = serviceState(r, now);
  if (!s.active) return { open: false, reason: s.reason } as const;
  if (r.orderingPaused) return { open: false, reason: "paused" } as const;
  if (r.openingHours && r.openingHours.length > 0 && !withinHours(r.openingHours, r.timezone, now)) return { open: false, reason: "closed" } as const;
  return { open: true, reason: "open" } as const;
}

export function withinHours(hours: { day: number; open: string; close: string }[], timezone: string, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")!.value);
  const minutes = Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
  const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  return hours.some((h) => {
    const open = toMin(h.open), close = toMin(h.close);
    if (close > open) return h.day === wd && minutes >= open && minutes < close;
    // past midnight: e.g. 18:00 → 02:00
    return (h.day === wd && minutes >= open) || (h.day === (wd + 6) % 7 && minutes < close);
  });
}
