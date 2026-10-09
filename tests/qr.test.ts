import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import sharp from "sharp";
import { qrCard, qrPng } from "@/lib/qr";

async function decode(png: Buffer, scale = 1) {
  const small = scale === 1 ? png : await sharp(png).resize({ width: Math.round((await sharp(png).metadata()).width! * scale) }).png().toBuffer();
  const img = PNG.sync.read(small);
  return jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data ?? null;
}

const url = "https://menu.sitekoom.com/burger-house/t/AbCdEfGhIjKlMnOpQrStUv";

describe("table QR codes", () => {
  it("encode exactly the table URL — also on the printable card and when printed small", async () => {
    expect(await decode(await qrPng(url))).toBe(url);
    const card = await qrCard({ restaurant: "برجر هاوس", tableNumber: 12, url, primary: "#C2410C" });
    expect(await decode(card)).toBe(url);
    expect(await decode(card, 0.25)).toBe(url); // ~300 px wide: a small sticker / low-resolution photo
  });

  it("contain no secret besides the table token (no restaurant id, no device credentials)", async () => {
    const decoded = (await decode(await qrPng(url)))!;
    expect(decoded).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no internal UUIDs
    expect(new URL(decoded).pathname.split("/")).toEqual(["", "burger-house", "t", "AbCdEfGhIjKlMnOpQrStUv"]);
  });
});
