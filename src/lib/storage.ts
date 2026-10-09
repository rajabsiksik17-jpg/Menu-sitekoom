import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { log } from "./log";

/**
 * Where image files live:
 * - "supabase" (production on serverless hosting): Supabase Storage, a public bucket served from Supabase's CDN.
 *   Configured with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server only, never sent to browsers) and SUPABASE_BUCKET.
 * - "local" (development / a single server with a persistent disk): files under DATA_DIR/media.
 */
export type StorageDriver = "local" | "supabase";

export const storage = {
  get driver(): StorageDriver {
    return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local";
  },
  get bucket() {
    return process.env.SUPABASE_BUCKET || "menu-media";
  },
};

const supabaseBase = () => process.env.SUPABASE_URL!.replace(/\/+$/, "");
/**
 * Accepts both key formats: the newer secret key ("sb_secret_…", not a JWT — sent only as `apikey`, the gateway authorizes
 * it) and the legacy service_role JWT ("eyJ…", also sent as the bearer token).
 */
function supabaseHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

let bucketReady: Promise<void> | null = null;

/** Creates the public bucket on first use (idempotent): no manual step in the Supabase dashboard. */
function ensureBucket() {
  bucketReady ??= (async () => {
    const res = await fetch(`${supabaseBase()}/storage/v1/bucket/${storage.bucket}`, { headers: supabaseHeaders() });
    if (res.ok) return;
    const created = await fetch(`${supabaseBase()}/storage/v1/bucket`, {
      method: "POST", headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ id: storage.bucket, name: storage.bucket, public: true, file_size_limit: 10 * 1024 * 1024, allowed_mime_types: ["image/webp"] }),
    });
    if (!created.ok && created.status !== 409) throw new Error(`Supabase bucket: ${created.status} ${await created.text()}`);
  })().catch((e) => {
    bucketReady = null;
    throw e;
  });
  return bucketReady;
}

/** Stores one object (key like "<restaurantId>/<sha>.lg.webp"). Immutable content → cached for a year. */
export async function putObject(key: string, data: Buffer, contentType = "image/webp") {
  if (storage.driver === "supabase") {
    await ensureBucket();
    const res = await fetch(`${supabaseBase()}/storage/v1/object/${storage.bucket}/${key}`, {
      method: "POST",
      headers: { ...supabaseHeaders(), "Content-Type": contentType, "Cache-Control": "max-age=31536000", "x-upsert": "true" },
      body: new Uint8Array(data),
    });
    if (!res.ok) {
      const text = await res.text();
      log.error("storage.put_failed", { key, status: res.status, text: text.slice(0, 200) });
      throw new Error(`Image storage failed (${res.status})`);
    }
    return;
  }
  const file = path.join(/*turbopackIgnore: true*/ env.dataDir, "media", key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

/** Local driver: the bytes. Supabase driver: null (use publicUrl). */
export async function readObject(key: string): Promise<Buffer | null> {
  if (storage.driver === "supabase") return null;
  try {
    return await fs.readFile(path.join(/*turbopackIgnore: true*/ env.dataDir, "media", key));
  } catch {
    return null;
  }
}

export function publicUrl(key: string): string | null {
  return storage.driver === "supabase" ? `${supabaseBase()}/storage/v1/object/public/${storage.bucket}/${key}` : null;
}
