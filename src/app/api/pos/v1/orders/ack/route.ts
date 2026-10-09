import { json, readJson } from "@/lib/http";
import { ackOrders } from "@/server/pos";
import { ackSchema } from "@/server/pos-schemas";
import { posRoute } from "@/server/route-helpers";

/** The POS stored these orders in its own database: mark them delivered. */
export async function POST(req: Request) {
  return posRoute(req, async (db, device) => {
    const { ids } = ackSchema.parse(await readJson(req, 32 * 1024));
    return json(await ackOrders(db, device, ids));
  });
}
