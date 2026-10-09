import { json } from "@/lib/http";
import { waitForOrders } from "@/server/pos";
import { posRoute } from "@/server/route-helpers";

export const dynamic = "force-dynamic";
// Long poll up to 25 s (serverless hosts need an explicit limit above it).
export const maxDuration = 35;

/**
 * Long poll: the POS keeps one outbound request open (no port forwarding at the restaurant). Returns as soon as an order
 * is waiting, or empty after `wait` seconds (max 25). Orders stay "submitted" until the POS acknowledges them, so a lost
 * response only means they are sent again — the POS deduplicates by order id.
 */
export async function GET(req: Request) {
  return posRoute(req, async (db, device) => {
    const wait = Math.max(0, Math.min(25, Number(new URL(req.url).searchParams.get("wait") ?? 0) || 0));
    const list = await waitForOrders(db, device.restaurantId, wait * 1000, req.signal);
    return json({ orders: list, serverTime: new Date().toISOString() });
  });
}
