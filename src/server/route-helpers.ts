import "server-only";
import { getDb, type Db } from "@/db";
import { clientIp, handle } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { tooMany } from "@/lib/errors";
import { authenticateDevice, type Device } from "./pos";

/** POS endpoint: authenticated device (bearer token) + a generous per-device rate limit. */
export function posRoute(req: Request, fn: (db: Db, device: Device, ip: string) => Promise<Response>) {
  return handle(req, async () => {
    const ip = clientIp(req);
    const db = await getDb();
    const device = await authenticateDevice(db, req.headers.get("authorization"), ip);
    if (!rateLimit(`pos:${device.id}`, 120, 120)) throw tooMany();
    return fn(db, device, ip);
  });
}
