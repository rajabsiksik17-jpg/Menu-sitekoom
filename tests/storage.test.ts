import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { createMemoryDb } from "@/db";
import { createRestaurant } from "@/server/admin";
import { imageCdnUrl, readImage, storeImage } from "@/lib/media";
import { pgConfig } from "@/db";
import { admin } from "./helpers";

/** A minimal stand-in for the Supabase Storage REST API (same paths, headers and status codes). */
const objects = new Map<string, Buffer>();
const buckets = new Set<string>();
const calls: string[] = [];
let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = req.url ?? "";
      calls.push(`${req.method} ${url}`);
      // Legacy service_role JWT: apikey + bearer. New secret key (sb_secret_…): apikey only, never as a bearer token.
      const key = req.headers.apikey as string | undefined;
      const authorized = key === "sb_secret_test"
        ? req.headers.authorization === undefined
        : key === "eyJservice" && req.headers.authorization === "Bearer eyJservice";
      if (req.method === "GET" && url.startsWith("/storage/v1/object/public/")) {
        const key = url.replace("/storage/v1/object/public/", "");
        const o = objects.get(key);
        res.writeHead(o ? 200 : 404, { "Content-Type": "image/webp" });
        return res.end(o);
      }
      if (!authorized) { res.writeHead(401); return res.end("{}"); }
      if (req.method === "GET" && url.startsWith("/storage/v1/bucket/")) {
        res.writeHead(buckets.has(url.split("/").pop()!) ? 200 : 404);
        return res.end("{}");
      }
      if (req.method === "POST" && url === "/storage/v1/bucket") {
        const b = JSON.parse(Buffer.concat(chunks).toString());
        expect(b.public).toBe(true);
        buckets.add(b.id);
        res.writeHead(200);
        return res.end("{}");
      }
      if (req.method === "POST" && url.startsWith("/storage/v1/object/")) {
        objects.set(url.replace("/storage/v1/object/", ""), Buffer.concat(chunks));
        res.writeHead(200);
        return res.end("{}");
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
  process.env.SUPABASE_BUCKET = "menu-media";
});

afterAll(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  server.close();
});

describe("Supabase storage", () => {
  it("creates the public bucket once, uploads both sizes and serves them from the CDN", async () => {
    const db = await createMemoryDb();
    const r = await createRestaurant(db, { slug: "cloud", nameAr: "x" }, admin);
    const png = await sharp({ create: { width: 1000, height: 600, channels: 3, background: "#ff8800" } }).png().toBuffer();
    const m = await storeImage(db, r.id, png, "admin");
    const png2 = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#0088ff" } }).png().toBuffer();
    await storeImage(db, r.id, png2, "pos");
    expect(buckets.has("menu-media")).toBe(true);
    expect(calls.filter((c) => c === "POST /storage/v1/bucket")).toHaveLength(1);
    expect([...objects.keys()].filter((k) => k.startsWith(`menu-media/${r.id}/`))).toHaveLength(4);
    const cdn = imageCdnUrl(m.path, "sm")!;
    expect(cdn).toBe(`${base}/storage/v1/object/public/menu-media/${m.path}.sm.webp`);
    const bytes = await readImage(m.path, "lg");
    expect((await sharp(bytes!).metadata()).format).toBe("webp");
  });

  it("also accepts a legacy service_role JWT", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJservice";
    try {
      const db = await createMemoryDb();
      const r = await createRestaurant(db, { slug: "legacy", nameAr: "x" }, admin);
      const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#00aa00" } }).png().toBuffer();
      const m = await storeImage(db, r.id, png, "admin");
      expect(objects.has(`menu-media/${m.path}.lg.webp`)).toBe(true);
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
    }
  });

  it("connects to Supabase Postgres with TLS", () => {
    const c = pgConfig("postgresql://postgres.abc:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require");
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.connectionString).not.toContain("sslmode");
    expect(pgConfig("postgres://u:p@localhost:5432/db").ssl).toBeUndefined();
  });
});
