import { getDb } from "@/db";
import { assertSameOrigin, clientIp, handle, json } from "@/lib/http";
import { requestInvoice } from "@/server/sessions";

/** "Request the invoice": stored once while active; the cashier is notified through the POS. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, async () => {
    assertSameOrigin(req);
    const result = await requestInvoice(await getDb(), (await ctx.params).token, clientIp(req));
    return json(result, result.duplicate ? 200 : 201);
  });
}
