import { currentAdmin } from "@/server/admin-auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Address search for the location map (administrators only), proxied to a Nominatim-compatible geocoder so that the
 * provider URL / key stay on the server. Default: OpenStreetMap Nominatim (max ~1 request/second, attribution required).
 */
export async function GET(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`geocode:${admin.id}`, 5, 30)) return Response.json([], { status: 429 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 3) return Response.json([]);
  const base = process.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search";
  const url = `${base}?format=jsonv2&limit=6&accept-language=ar,en&q=${encodeURIComponent(q)}${process.env.GEOCODER_KEY ? `&key=${process.env.GEOCODER_KEY}` : ""}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": process.env.GEOCODER_USER_AGENT ?? "POS-SITEKOOM-Menu/1.0 (admin geocoding)" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return Response.json([]);
    const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
    return Response.json(rows.map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) })));
  } catch {
    return Response.json([]);
  }
}
