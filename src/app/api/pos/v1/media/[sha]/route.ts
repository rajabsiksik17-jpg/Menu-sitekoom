import { json } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { MAX_UPLOAD_BYTES, storeImage } from "@/lib/media";
import { syncLog } from "@/lib/audit";
import { posRoute } from "@/server/route-helpers";

/** Upload one POS image (raw bytes); the URL hash must match the content. */
export async function PUT(req: Request, ctx: { params: Promise<{ sha: string }> }) {
  return posRoute(req, async (db, device) => {
    const { sha } = await ctx.params;
    if (!/^[0-9a-fA-F]{64}$/.test(sha)) throw new AppError("invalid_hash");
    if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) throw new AppError("image_too_large", 413);
    const bytes = Buffer.from(await req.arrayBuffer());
    try {
      const m = await storeImage(db, device.restaurantId, bytes, "pos", sha);
      return json({ sha: m.sha256, width: m.width, height: m.height });
    } catch (e) {
      await syncLog(db, device.restaurantId, device.id, "media", false, `${sha.slice(0, 12)}: ${(e as Error).message}`);
      throw e;
    }
  });
}
