import { imageCdnUrl, readImage } from "@/lib/media";

/** POS-synced images, addressed by restaurant + content hash (the same picture always has the same URL). */
export async function GET(req: Request, ctx: { params: Promise<{ rid: string; sha: string }> }) {
  const { rid, sha } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(rid) || !/^[0-9a-f]{64}$/.test(sha)) return new Response(null, { status: 404 });
  const size = new URL(req.url).searchParams.get("s") === "sm" ? "sm" : "lg";
  const cdn = imageCdnUrl(`${rid}/${sha}`, size);
  if (cdn) return new Response(null, { status: 302, headers: { Location: cdn, "Cache-Control": "public, max-age=86400" } });
  const bytes = await readImage(`${rid}/${sha}`, size);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
}
