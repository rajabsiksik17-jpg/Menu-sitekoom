import { getDb } from "@/db";
import { getRestaurant } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Card } from "@/components/admin/ui";
import { GeoEditor } from "./GeoEditor";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const r = await getRestaurant(await getDb(), id);
  const { t } = await adminT();
  if (!r) return null;
  const keys = ["geo.enabled", "geo.mode", "geo.radius", "geo.polygon", "geo.radiusM", "geo.accuracy", "geo.search", "geo.searchBtn", "geo.clickHint", "geo.clearPolygon",
    "geo.undo", "geo.lat", "geo.lng", "geo.incomplete", "geo.note", "common.save"] as const;
  const labels = Object.fromEntries(keys.map((k) => [k, t(k)])) as Record<(typeof keys)[number], string>;
  return (
    <Card title={t("tab.location")}>
      <GeoEditor id={r.id} labels={labels} pointsLabel={t("geo.points", "{0}")} tiles={process.env.MAP_TILES_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
        attribution={process.env.MAP_TILES_ATTRIBUTION ?? "© OpenStreetMap contributors"}
        initial={{ geoEnabled: r.geoEnabled, lat: r.lat, lng: r.lng, geoMode: r.geoMode as "radius" | "polygon", radiusM: r.radiusM, polygon: r.polygon, maxAccuracyM: r.maxAccuracyM }} />
    </Card>
  );
}
