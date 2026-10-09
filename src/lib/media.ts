import "server-only";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { media } from "@/db/schema";
import { sha256 } from "./crypto";
import { publicUrl, putObject, readObject } from "./storage";
import { AppError } from "./errors";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const SIZES = { lg: 1400, sm: 520 } as const;
export type MediaSize = keyof typeof SIZES;

/**
 * Stores an image for one restaurant: decoded and re-encoded by sharp (anything that is not a real image is refused,
 * metadata/EXIF stripped), saved as WebP in two widths. Deduplicated per restaurant by the SHA-256 of the original bytes,
 * so the POS can ask "which images are missing" before uploading.
 */
export async function storeImage(db: Db, restaurantId: string, bytes: Buffer, source: "pos" | "admin", knownSha?: string) {
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) throw new AppError("image_too_large", 413);
  const hash = sha256(bytes);
  if (knownSha && knownSha.toLowerCase() !== hash) throw new AppError("image_hash_mismatch", 400);
  const existing = await db.select().from(media).where(and(eq(media.restaurantId, restaurantId), eq(media.sha256, hash))).limit(1);
  if (existing[0]) return existing[0];

  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new AppError("image_invalid", 400);
  }
  if (!meta.width || !meta.height || !["jpeg", "png", "webp", "gif", "avif", "tiff", "heif"].includes(meta.format ?? ""))
    throw new AppError("image_invalid", 400);

  let width = 0, height = 0, size = 0;
  for (const [name, max] of Object.entries(SIZES)) {
    const out = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate()
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: name === "lg" ? 80 : 74 }).toBuffer({ resolveWithObject: true });
    await putObject(`${restaurantId}/${hash}.${name}.webp`, out.data);
    if (name === "lg") ({ width, height, size } = out.info);
  }
  const [row] = await db.insert(media).values({
    restaurantId, sha256: hash, mime: "image/webp", width, height, bytes: size, path: `${restaurantId}/${hash}`, source,
  }).onConflictDoNothing().returning();
  if (row) return row;
  const [again] = await db.select().from(media).where(and(eq(media.restaurantId, restaurantId), eq(media.sha256, hash))).limit(1);
  return again!;
}

const validPath = (p: string) => /^[0-9a-f-]{36}\/[0-9a-f]{64}$/.test(p);

/** Bytes of a stored image (local disk, or downloaded from the storage CDN) — used to compose QR cards with the logo. */
export async function readImage(storedPath: string, size: MediaSize): Promise<Buffer | null> {
  // storedPath is "<uuid>/<sha256>" from the database (never user input); still refuse anything unexpected.
  if (!validPath(storedPath)) return null;
  const key = `${storedPath}.${size}.webp`;
  const url = publicUrl(key);
  if (!url) return readObject(key);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** With cloud storage the browser is redirected to the CDN copy; locally the route streams the file. */
export function imageCdnUrl(storedPath: string, size: MediaSize): string | null {
  return validPath(storedPath) ? publicUrl(`${storedPath}.${size}.webp`) : null;
}

export const mediaUrl = (id: string | null | undefined, size: MediaSize = "lg") => (id ? `/media/${id}?s=${size}` : null);
