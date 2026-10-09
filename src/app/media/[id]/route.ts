import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { media } from "@/db/schema";
import { imageCdnUrl, readImage } from "@/lib/media";

export const dynamic = "force-dynamic";

/** Uploaded images (logos, covers, banners). Immutable by id → long browser/CDN cache. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const [m] = await (await getDb()).select({ path: media.path }).from(media).where(eq(media.id, id)).limit(1);
  const size = new URL(req.url).searchParams.get("s") === "sm" ? "sm" : "lg";
  const cdn = m ? imageCdnUrl(m.path, size) : null;
  if (cdn) return new Response(null, { status: 302, headers: { Location: cdn, "Cache-Control": "public, max-age=86400" } });
  const bytes = m ? await readImage(m.path, size) : null;
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
}
