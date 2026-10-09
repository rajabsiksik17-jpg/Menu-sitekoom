import { json, readJson } from "@/lib/http";
import { applyStatuses } from "@/server/pos";
import { statusSchema } from "@/server/pos-schemas";
import { posRoute } from "@/server/route-helpers";

/** Cashier decisions (accept, preparing, ready, completed, reject, cancel, new estimate) for the customer's tracking page. */
export async function POST(req: Request) {
  return posRoute(req, async (db, device) => {
    const { updates } = statusSchema.parse(await readJson(req, 128 * 1024));
    return json(await applyStatuses(db, device, updates));
  });
}
