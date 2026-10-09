import { json, readJson } from "@/lib/http";
import { syncLog } from "@/lib/audit";
import { syncMenu } from "@/server/pos";
import { menuSchema } from "@/server/pos-schemas";
import { posRoute } from "@/server/route-helpers";

/** Full menu snapshot from the POS; answers with the image hashes the platform still needs. */
export async function PUT(req: Request) {
  return posRoute(req, async (db, device) => {
    const parsed = menuSchema.safeParse(await readJson(req, 8 * 1024 * 1024));
    if (!parsed.success) {
      await syncLog(db, device.restaurantId, device.id, "menu", false, parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      throw parsed.error;
    }
    return json(await syncMenu(db, device, parsed.data));
  });
}
