import { json } from "@/lib/http";
import { waitForOrders } from "@/server/pos";
import { posRoute } from "@/server/route-helpers";

export const dynamic = "force-dynamic";
// Long poll up to 25 s (serverless hosts need an explicit limit above it).
export const maxDuration = 35;

/**
 * Long poll: the POS keeps one outbound request open (no port forwarding at the restaurant). Returns as soon as an order
 * or an invoice request is waiting, or empty after `wait` seconds (max 25). Both stay pending until the POS acknowledges
 * them, so a lost response only means they are sent again — the POS deduplicates by id.
 */
export async function GET(req: Request) {
  return posRoute(req, async (db, device) => {
    const wait = Math.max(0, Math.min(25, Number(new URL(req.url).searchParams.get("wait") ?? 0) || 0));
    const { orders, requests } = await waitForOrders(db, device.restaurantId, wait * 1000, req.signal);
    return json({ orders, requests, serverTime: new Date().toISOString() });
  });
}
