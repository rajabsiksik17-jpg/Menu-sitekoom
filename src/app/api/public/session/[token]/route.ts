import { getDb } from "@/db";
import { clientIp, handle, json } from "@/lib/http";
import { notFound, tooMany } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { publicView, waitForSession } from "@/server/sessions";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

/**
 * The table session for its customers (the unguessable token on their phone is the access). With `v` (the version the
 * page has) and `wait` (≤ 20 s) it long-polls: answers as soon as anything changes. 410 = the session ended and its
 * display time passed — the page forgets it.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  return handle(req, async () => {
    if (!rateLimit(`session:${clientIp(req)}`, 90, 60)) throw tooMany();
    const params = new URL(req.url).searchParams;
    const since = params.has("v") ? Number(params.get("v")) : null;
    const wait = Math.max(0, Math.min(20, Number(params.get("wait") ?? 0) || 0));
    const view = await waitForSession(await getDb(), (await ctx.params).token, Number.isFinite(since) ? since : null, wait * 1000, req.signal);
    if (!view) throw notFound("session_not_found");
    if (view.gone) return json({ error: "session_ended" }, 410, { "Cache-Control": "no-store" });
    return json(publicView(view), 200, { "Cache-Control": "no-store" });
  });
}
