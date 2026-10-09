import { getDb } from "@/db";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { tooMany } from "@/lib/errors";
import { enroll } from "@/server/pos";
import { enrollSchema } from "@/server/pos-schemas";

/** POS → platform: exchange a one-time connection code for a device token (returned once). */
export async function POST(req: Request) {
  return handle(req, async () => {
    const ip = clientIp(req);
    if (!rateLimit(`enroll:${ip}`, 10, 2)) throw tooMany();
    const input = enrollSchema.parse(await readJson(req, 8 * 1024));
    return json(await enroll(await getDb(), input, ip), 201);
  });
}
