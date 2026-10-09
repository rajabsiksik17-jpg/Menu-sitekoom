import { json, readJson } from "@/lib/http";
import { ackRequests } from "@/server/sessions";
import { ackSchema } from "@/server/pos-schemas";
import { posRoute } from "@/server/route-helpers";

/** The POS stored these invoice requests: they become "delivered" (never re-sent). */
export async function POST(req: Request) {
  return posRoute(req, async (db, device) => {
    const { ids } = ackSchema.parse(await readJson(req, 32 * 1024));
    return json(await ackRequests(db, device, ids));
  });
}
