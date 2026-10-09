import type { Db } from "@/db";
import { auditLogs, syncLogs } from "@/db/schema";
import { log } from "./log";

export type Actor = { type: "admin" | "pos" | "customer" | "system"; id?: string | null; ip?: string | null };

/** Durable audit entry (who did what to which restaurant). Details never contain secrets. */
export async function audit(db: Db, restaurantId: string | null, actor: Actor, action: string, details?: Record<string, unknown>) {
  await db.insert(auditLogs).values({ restaurantId, actorType: actor.type, actorId: actor.id ?? null, action, details: details ?? null, ip: actor.ip ?? null });
}

export async function syncLog(db: Db, restaurantId: string, deviceId: string | null, kind: string, ok: boolean, detail?: string) {
  try {
    await db.insert(syncLogs).values({ restaurantId, deviceId, kind, ok, detail: detail?.slice(0, 1000) ?? null });
  } catch (e) {
    log.warn("sync_log.failed", { error: (e as Error).message });
  }
}
