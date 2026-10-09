import { json } from "@/lib/http";
import { status } from "@/server/pos";
import { posRoute } from "@/server/route-helpers";

export async function GET(req: Request) {
  return posRoute(req, async (db, device) => json(await status(db, device)));
}
