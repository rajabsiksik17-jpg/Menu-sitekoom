import { json, readJson } from "@/lib/http";
import { syncTables } from "@/server/pos";
import { tablesSchema } from "@/server/pos-schemas";
import { posRoute } from "@/server/route-helpers";

/** Create/update tables by their POS uid (idempotent); returns every table with its public QR URL. */
export async function PUT(req: Request) {
  return posRoute(req, async (db, device) => {
    const { tables } = tablesSchema.parse(await readJson(req, 512 * 1024));
    return json(await syncTables(db, device, tables));
  });
}
