import { z } from "zod";
import { getDb } from "@/db";
import { assertSameOrigin, clientIp, handle, json, readJson } from "@/lib/http";
import { notFound, tooMany } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { checkLocation } from "@/lib/geo";
import { findRestaurantBySlug } from "@/server/menu";

const schema = z.object({
  slug: z.string().max(60),
  lat: z.number().finite(), lng: z.number().finite(), accuracy: z.number().finite().min(0), capturedAt: z.number().finite().optional(),
});

/**
 * Early feedback for the menu ("you are inside / outside"). Answers only a verdict and a distance — never the area itself.
 * Not a permission: the order submission is checked again on the server.
 */
export async function POST(req: Request) {
  return handle(req, async () => {
    assertSameOrigin(req);
    if (!rateLimit(`geo:${clientIp(req)}`, 30, 15)) throw tooMany();
    const v = schema.parse(await readJson(req, 2048));
    const r = await findRestaurantBySlug(await getDb(), v.slug);
    if (!r) throw notFound();
    if (!r.geoEnabled) return json({ required: false, ok: true });
    const verdict = checkLocation({ mode: r.geoMode, lat: r.lat, lng: r.lng, radiusM: r.radiusM, polygon: r.polygon, maxAccuracyM: r.maxAccuracyM }, v);
    return json({ required: true, ...verdict, maxAccuracyM: r.maxAccuracyM });
  });
}
