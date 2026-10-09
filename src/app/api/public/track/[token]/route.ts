import { getDb } from "@/db";
import { clientIp, handle, json } from "@/lib/http";
import { notFound, tooMany } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { getTracking } from "@/server/orders";

export const dynamic = "force-dynamic";

/** Polled by the tracking page (every few seconds). Only this order, only customer-facing fields. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, async () => {
    if (!rateLimit(`track:${clientIp(req)}`, 120, 60)) throw tooMany();
    const t = await getTracking(await getDb(), (await ctx.params).token);
    if (!t) throw notFound();
    return json(t);
  });
}
