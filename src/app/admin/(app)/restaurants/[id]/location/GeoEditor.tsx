"use client";

import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ActionForm } from "@/components/admin/client";
import { updateGeoAction } from "../../../../actions";

type Geo = { geoEnabled: boolean; lat: number | null; lng: number | null; geoMode: "radius" | "polygon"; radiusM: number; polygon: [number, number][] | null; maxAccuracyM: number };

/**
 * Restaurant point + permitted ordering area on an interactive map (Leaflet + OpenStreetMap-compatible tiles).
 * The point: address search, "use my location" (high-accuracy browser geolocation, with the reported accuracy shown as a
 * circle), a click on the map, or dragging the marker. Radius mode: set the radius (slider or number). Polygon mode: each
 * click adds a vertex. GPS accuracy varies (especially indoors), so the result is always shown for the admin to verify.
 */
export function GeoEditor({ id, initial, labels, pointsLabel, tiles, attribution }: {
  id: string; initial: Geo; labels: Record<string, string>; pointsLabel: string; tiles: string; attribution: string;
}) {
  const tx = (k: string) => labels[k] ?? k;
  const [g, setG] = useState<Geo>({ ...initial, polygon: initial.polygon ?? [] });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locMsg, setLocMsg] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const lib = useRef<typeof L | null>(null);
  const state = useRef(g);
  state.current = g;
  const fixRef = useRef(fix);
  fixRef.current = fix;
  const fix_ = fixRef; // drawn with the point (orange dashed circle = reported accuracy)

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = (await import("leaflet")).default;
      if (cancelled || !mapEl.current || map.current) return;
      lib.current = leaflet;
      const center: [number, number] = initial.lat != null && initial.lng != null ? [initial.lat, initial.lng] : initial.polygon?.[0] ?? [31.9539, 35.9106];
      const m = leaflet.map(mapEl.current, { zoomControl: true }).setView(center, initial.lat != null || initial.polygon?.length ? 18 : 12);
      leaflet.tileLayer(tiles, { maxZoom: 20, attribution }).addTo(m);
      layer.current = leaflet.layerGroup().addTo(m);
      m.on("click", (e: L.LeafletMouseEvent) => {
        const p: [number, number] = [round(e.latlng.lat), round(e.latlng.lng)];
        setG((s) => (s.geoMode === "polygon" ? { ...s, polygon: [...(s.polygon ?? []), p] } : { ...s, lat: p[0], lng: p[1] }));
      });
      map.current = m;
      draw();
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(draw, [g, fix]); // eslint-disable-line react-hooks/exhaustive-deps

  function locate() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return setLocMsg({ kind: "error", text: tx("geo.locUnsupported") });
    setLocating(true);
    setLocMsg(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const point = { lat: round(p.coords.latitude), lng: round(p.coords.longitude), accuracy: Math.round(p.coords.accuracy) };
        setFix(point);
        setG((x) => ({ ...x, lat: point.lat, lng: point.lng }));
        map.current?.setView([point.lat, point.lng], point.accuracy > 200 ? 16 : 19);
        setLocMsg(point.accuracy > 50
          ? { kind: "warn", text: tx("geo.locLow").replace("{0}", String(point.accuracy)) }
          : { kind: "ok", text: tx("geo.locAccuracy").replace("{0}", String(point.accuracy)) });
      },
      (e) => {
        setLocating(false);
        setLocMsg({ kind: "error", text: tx(e.code === e.PERMISSION_DENIED ? "geo.locDenied" : e.code === e.TIMEOUT ? "geo.locTimeout" : "geo.locUnavailable") });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  function draw() {
    const leaflet = lib.current, grp = layer.current;
    if (!leaflet || !grp) return;
    const s = state.current;
    grp.clearLayers();
    if (fix_.current) leaflet.circle([fix_.current.lat, fix_.current.lng], { radius: fix_.current.accuracy, color: "#f59e0b", weight: 1, dashArray: "4 4", fillOpacity: 0.08, interactive: false }).addTo(grp);
    if (s.lat != null && s.lng != null) {
      if (s.geoMode === "radius") leaflet.circle([s.lat, s.lng], { radius: s.radiusM, color: "#2563eb", fillOpacity: 0.15, interactive: false }).addTo(grp);
      // Draggable point (a CSS marker: no image files to bundle).
      const icon = leaflet.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11], html: '<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#2563eb;border:4px solid #fff;box-shadow:0 0 0 2px #1d4ed8,0 2px 6px rgba(0,0,0,.35)"></span>' });
      const marker = leaflet.marker([s.lat, s.lng], { draggable: true, icon, keyboard: true, title: tx("geo.dragHint") }).addTo(grp);
      marker.on("dragend", () => { const ll = marker.getLatLng(); setG((x) => ({ ...x, lat: round(ll.lat), lng: round(ll.lng) })); });
    }
    if (s.geoMode === "polygon" && s.polygon && s.polygon.length) {
      s.polygon.forEach((p) => leaflet.circleMarker(p, { radius: 5, color: "#7c3aed", fillOpacity: 1 }).addTo(grp));
      if (s.polygon.length >= 2) leaflet.polygon(s.polygon, { color: "#7c3aed", fillOpacity: s.polygon.length >= 3 ? 0.15 : 0 }).addTo(grp);
    }
  }

  async function search() {
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(query.trim())}`);
      setResults(res.ok ? await res.json() : []);
    } finally { setSearching(false); }
  }

  const ready = g.geoMode === "polygon" ? (g.polygon?.length ?? 0) >= 3 : g.lat != null && g.lng != null && g.radiusM >= 10;
  const payload = JSON.stringify({ ...g, polygon: g.polygon?.length ? g.polygon : null });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
          placeholder={tx("geo.search")} className="input max-w-md" />
        <button type="button" onClick={search} className="btn-secondary" disabled={searching}>{tx("geo.searchBtn")}</button>
        <button type="button" onClick={locate} className="btn-primary" disabled={locating} aria-busy={locating}>
          {locating && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
          {locating ? tx("geo.locating") : tx("geo.locate")}
        </button>
      </div>
      {locMsg && (
        <p role={locMsg.kind === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm ${locMsg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : locMsg.kind === "warn" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-700"}`}>
          {locMsg.text}
        </p>
      )}
      {results.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 text-sm">
          {results.map((r, i) => (
            <li key={i}><button type="button" className="w-full px-3 py-2 text-start hover:bg-slate-50" onClick={() => {
              setG((s) => ({ ...s, lat: round(r.lat), lng: round(r.lng) })); map.current?.setView([r.lat, r.lng], 18); setResults([]);
            }}>{r.name}</button></li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">{tx("geo.clickHint")} {tx("geo.dragHint")}</p>
      <div ref={mapEl} className="h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200" />
      <div className="grid gap-4 md:grid-cols-4">
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{tx("geo.mode")}</span>
          <select className="input" value={g.geoMode} onChange={(e) => setG((s) => ({ ...s, geoMode: e.target.value as Geo["geoMode"] }))}>
            <option value="radius">{tx("geo.radius")}</option><option value="polygon">{tx("geo.polygon")}</option>
          </select>
        </label>
        {g.geoMode === "radius" ? (
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{tx("geo.radiusM")}</span>
            <input type="number" min={10} max={5000} className="input" value={g.radiusM} onChange={(e) => setG((s) => ({ ...s, radiusM: Math.max(10, Math.min(5000, Number(e.target.value) || 10)) }))} />
            <input type="range" min={10} max={500} step={5} className="mt-2 w-full accent-blue-700" value={Math.min(500, g.radiusM)} aria-label={tx("geo.radiusM")}
              onChange={(e) => setG((s) => ({ ...s, radiusM: Number(e.target.value) }))} />
          </label>
        ) : (
          <div className="flex items-end gap-2 text-sm">
            <span className="pb-2 text-slate-600">{pointsLabel.replace("{0}", String(g.polygon?.length ?? 0))}</span>
            <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setG((s) => ({ ...s, polygon: (s.polygon ?? []).slice(0, -1) }))}>{tx("geo.undo")}</button>
            <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setG((s) => ({ ...s, polygon: [] }))}>{tx("geo.clearPolygon")}</button>
          </div>
        )}
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{tx("geo.accuracy")}</span>
          <input type="number" min={10} max={1000} className="input" value={g.maxAccuracyM} onChange={(e) => setG((s) => ({ ...s, maxAccuracyM: Math.max(10, Math.min(1000, Number(e.target.value) || 10)) }))} />
        </label>
        <div className="text-xs text-slate-500" dir="ltr">
          {tx("geo.lat")}: {g.lat ?? "—"}<br />{tx("geo.lng")}: {g.lng ?? "—"}
          {fix && <><br />± {fix.accuracy} m</>}
        </div>
      </div>
      <ActionForm action={updateGeoAction} submit={tx("common.save")}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="payload" value={payload} />
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={g.geoEnabled} onChange={(e) => setG((s) => ({ ...s, geoEnabled: e.target.checked }))} /> {tx("geo.enabled")}
        </label>
        {g.geoEnabled && !ready && <p className="text-sm text-amber-700">{tx("geo.incomplete")}</p>}
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{tx("geo.note")} {tx("geo.locNote")}</p>
      </ActionForm>
    </div>
  );
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
