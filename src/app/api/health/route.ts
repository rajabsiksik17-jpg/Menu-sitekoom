import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { startupProblem } from "@/server/bootstrap";

export const dynamic = "force-dynamic";

/** Liveness + database check for the hosting provider's health probe / uptime monitor. */
export async function GET() {
  if (startupProblem()) return Response.json({ ok: false, startup: "failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    await (await getDb()).execute(sql`select 1`);
    return Response.json({ ok: true, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
