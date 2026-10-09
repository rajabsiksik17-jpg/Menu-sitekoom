import { and, eq } from "drizzle-orm";
import { diningTables, media, restaurants } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { qrCard, qrPng } from "@/lib/qr";
import { readImage } from "@/lib/media";
import { tableUrl } from "@/server/pos";
import { posRoute } from "@/server/route-helpers";

/** The table's QR as PNG for the POS to save or print: ?uid=…&kind=card|code */
export async function GET(req: Request) {
  return posRoute(req, async (db, device) => {
    const sp = new URL(req.url).searchParams;
    const uid = (sp.get("uid") ?? "").toLowerCase();
    if (!/^[0-9a-f-]{32,36}$/.test(uid)) throw new AppError("invalid_uid");
    const [row] = await db.select({ t: diningTables, r: restaurants }).from(diningTables)
      .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
      .where(and(eq(diningTables.restaurantId, device.restaurantId), eq(diningTables.posUid, uid))).limit(1);
    if (!row) throw notFound("table_not_found");
    const url = tableUrl(row.r.slug, row.t.token);
    let png: Buffer;
    if (sp.get("kind") === "code") png = await qrPng(url, 1024);
    else {
      let logo: Buffer | null = null;
      if (row.r.logoMediaId) {
        const [m] = await db.select({ path: media.path }).from(media).where(eq(media.id, row.r.logoMediaId)).limit(1);
        logo = m ? await readImage(m.path, "sm") : null;
      }
      png = await qrCard({ restaurant: row.r.nameAr, tableNumber: row.t.number, tableName: row.t.name, url, primary: row.r.theme.primary, logo });
    }
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  });
}
