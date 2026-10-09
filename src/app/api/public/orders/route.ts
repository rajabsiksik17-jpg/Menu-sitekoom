import { getDb } from "@/db";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/lib/http";
import { submitOrder, submitSchema } from "@/server/orders";

/** Customer order from a table QR (prices, table and location are all validated on the server). */
export async function POST(req: Request) {
  return handle(req, async () => {
    assertSameOrigin(req);
    const input = submitSchema.parse(await readJson(req, 64 * 1024));
    const result = await submitOrder(await getDb(), input, clientIp(req));
    return json({ number: result.number, trackingToken: result.trackingToken, sessionToken: result.sessionToken, status: result.status, total: result.total }, result.duplicate ? 200 : 201);
  });
}
