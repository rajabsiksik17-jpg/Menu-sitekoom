import { json, readJson } from "@/lib/http";
import { rotateTable } from "@/server/pos";
import { rotateSchema } from "@/server/pos-schemas";
import { posRoute } from "@/server/route-helpers";

/** Regenerate a table's QR token (the old QR stops accepting orders immediately). */
export async function POST(req: Request) {
  return posRoute(req, async (db, device, ip) => {
    const { uid } = rotateSchema.parse(await readJson(req, 4 * 1024));
    return json(await rotateTable(db, device.restaurantId, uid, { type: "pos", id: device.id, ip }));
  });
}
