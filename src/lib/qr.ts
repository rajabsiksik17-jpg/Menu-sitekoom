import "server-only";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

/** Plain QR code (PNG). Error correction "Q" survives scratches and a small logo-free print well on table cards. */
export async function qrPng(url: string, size = 1024): Promise<Buffer> {
  return QRCode.toBuffer(url, { errorCorrectionLevel: "Q", margin: 2, width: size, color: { dark: "#111111", light: "#ffffff" } });
}

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 2 });
}

// Bundled fonts (Noto Kufi Arabic, SIL OFL): text is drawn from these files, so cards look identical on Windows, a Linux
// container or a serverless function (none of which can be assumed to have an Arabic font installed).
const FONT_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "assets", "fonts");
const FONTS = {
  regular: { file: path.join(FONT_DIR, "NotoKufiArabic_400Regular.ttf"), name: "Noto Kufi Arabic" },
  bold: { file: path.join(FONT_DIR, "NotoKufiArabic_800ExtraBold.ttf"), name: "Noto Kufi Arabic ExtraBold" },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** One line of text as a transparent PNG (Pango: Arabic shaping and bidi included), shrunk to fit maxWidth. */
async function textLine(text: string, px: number, color: string, weight: keyof typeof FONTS, maxWidth: number) {
  const f = FONTS[weight];
  let size = px;
  for (;;) {
    const { data, info } = await sharp({ text: { text: `<span foreground="${color}">${esc(text)}</span>`, font: `${f.name} ${size}`, fontfile: f.file, rgba: true, dpi: 72 } })
      .png().toBuffer({ resolveWithObject: true });
    if (info.width <= maxWidth || size <= 18) return { input: data, width: info.width, height: info.height };
    size = Math.floor(size * 0.9);
  }
}

/** Printable table card (PNG, 1200×1700 ≈ A6 at 300 dpi): restaurant name, the QR, the table number and the instruction. */
export async function qrCard(opts: { restaurant: string; tableNumber: number; tableName?: string | null; url: string; primary: string; logo?: Buffer | null }) {
  const W = 1200, H = 1700, Q = 860;
  const primary = /^#[0-9a-fA-F]{6}$/.test(opts.primary) ? opts.primary : "#0B5CAD";
  const qr = await qrPng(opts.url, Q);
  const table = opts.tableName ? opts.tableName : `طاولة ${opts.tableNumber}`;
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect width="${W}" height="300" fill="${primary}"/>
    <rect x="${(W - Q) / 2 - 30}" y="360" width="${Q + 60}" height="${Q + 60}" rx="48" fill="#ffffff" stroke="${primary}" stroke-width="10"/>
  </svg>`;
  const layers: { input: Buffer; top: number; left: number }[] = [{ input: qr, top: 390, left: (W - Q) / 2 }];
  const center = (t: { input: Buffer; width: number; height: number }, middleY: number) =>
    layers.push({ input: t.input, left: Math.round((W - t.width) / 2), top: Math.round(middleY - t.height / 2) });

  let nameY = 150;
  if (opts.logo) {
    const logo = await sharp(opts.logo).resize({ height: 110, width: 340, fit: "inside" }).png().toBuffer();
    const meta = await sharp(logo).metadata();
    layers.push({ input: logo, top: 28, left: Math.round((W - (meta.width ?? 0)) / 2) });
    nameY = 220;
  }
  center(await textLine(opts.restaurant, opts.logo ? 54 : 72, "#ffffff", "bold", W - 120), nameY);
  center(await textLine(table, 110, "#111111", "bold", W - 120), 1390);
  center(await textLine("امسح الرمز لتصفح القائمة والطلب", 48, "#444444", "regular", W - 120), 1520);
  center(await textLine(`Scan to view the menu and order · Table ${opts.tableNumber}`, 34, "#777777", "regular", W - 120), 1605);
  return sharp(Buffer.from(bg)).composite(layers).png().toBuffer();
}
