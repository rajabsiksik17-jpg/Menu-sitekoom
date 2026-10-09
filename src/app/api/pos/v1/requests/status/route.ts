import { json, readJson } from "@/lib/http";
import { applyRequestStatuses } from "@/server/sessions";
import { requestStatusSchema } from "@/server/pos-schemas";
import { posRoute } from "@/server/route-helpers";

/** The cashier acknowledged, printed or dismissed invoice requests. */
export async function POST(req: Request) {
  return posRoute(req, async (db, device) => {
    const { updates } = requestStatusSchema.parse(await readJson(req, 64 * 1024));
    return json(await applyRequestStatuses(db, device, updates));
  });
}
