import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { diningTables, media, restaurants } from "@/db/schema";
import { currentAdmin } from "@/server/admin-auth";
import { tableUrl } from "@/server/pos";
import { qrCard, qrPng } from "@/lib/qr";
import { readImage } from "@/lib/media";

export const dynamic = "force-dynamic";

/** QR of one table for the dashboard: ?restaurant=&uid=&kind=card|code&download=1 (administrators only). */
export async function GET(req: Request) {
  if (!(await currentAdmin())) return new Response(null, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const rid = sp.get("restaurant") ?? "", uid = (sp.get("uid") ?? "").toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(rid) || !/^[0-9a-f-]{32,36}$/.test(uid)) return new Response(null, { status: 400 });
  const db = await getDb();
  const [row] = await db.select({ t: diningTables, r: restaurants }).from(diningTables).innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
    .where(and(eq(diningTables.restaurantId, rid), eq(diningTables.posUid, uid))).limit(1);
  if (!row) return new Response(null, { status: 404 });
  const url = tableUrl(row.r.slug, row.t.token);
  let png: Buffer;
  if (sp.get("kind") === "code") png = await qrPng(url, Number(sp.get("size")) > 0 ? Math.min(2048, Number(sp.get("size"))) : 1024);
  else {
    let logo: Buffer | null = null;
    if (row.r.logoMediaId) {
      const [m] = await db.select({ path: media.path }).from(media).where(eq(media.id, row.r.logoMediaId)).limit(1);
      logo = m ? await readImage(m.path, "sm") : null;
    }
    png = await qrCard({ restaurant: row.r.nameAr, tableNumber: row.t.number, tableName: row.t.name, url, primary: row.r.theme.primary, logo });
  }
  const headers: Record<string, string> = { "Content-Type": "image/png", "Cache-Control": "private, no-store" };
  if (sp.get("download")) headers["Content-Disposition"] = `attachment; filename="${row.r.slug}-table-${row.t.number}${sp.get("kind") === "code" ? "-qr" : "-card"}.png"`;
  return new Response(new Uint8Array(png), { headers });
}
