import { json, readJson } from "@/lib/http";
import { closeTables } from "@/server/sessions";
import { tablesCloseSchema } from "@/server/pos-schemas";
import { posRoute } from "@/server/route-helpers";

/** The cashier ended table sessions: the customers' view closes (their invoice stays visible for the configured time). */
export async function POST(req: Request) {
  return posRoute(req, async (db, device) => {
    const { closes } = tablesCloseSchema.parse(await readJson(req, 64 * 1024));
    return json(await closeTables(db, device, closes));
  });
}
