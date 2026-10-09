import Link from "next/link";
import { and, eq, lt, or, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { listOrders, platformStats } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Badge, Card, Empty, PageHeader, Stat, Table, Td, ago, fmtDate, fmtMoney, statusTone } from "@/components/admin/ui";

export default async function Dashboard() {
  const { t, lang } = await adminT();
  const db = await getDb();
  const stale = new Date(Date.now() - 5 * 60_000);
  const [stats, recent, offline] = await Promise.all([
    platformStats(db),
    listOrders(db, { page: 1, pageSize: 8 }),
    db.select().from(restaurants).where(and(eq(restaurants.status, "active"), or(isNull(restaurants.posLastSeenAt), lt(restaurants.posLastSeenAt, stale)))).limit(10),
  ]);
  return (
    <>
      <PageHeader title={t("nav.dashboard")} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("dash.restaurants")} value={stats.restaurants} href="/admin/restaurants" />
        <Stat label={t("dash.active")} value={stats.active} />
        <Stat label={t("dash.connected")} value={stats.connected} />
        <Stat label={t("dash.orders24")} value={stats.orders24h} href="/admin/orders" />
        <Stat label={t("dash.waiting")} value={stats.waitingForPos} tone={stats.waitingForPos ? "amber" : undefined} href="/admin/orders?status=submitted" />
        <Stat label={t("dash.syncErrors")} value={stats.syncErrors24h} tone={stats.syncErrors24h ? "red" : undefined} href="/admin/sync?errors=1" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title={t("dash.recentOrders")} className="xl:col-span-2" actions={<Link href="/admin/orders" className="text-sm text-blue-700">{t("common.view")} ←</Link>}>
          <Table head={[t("orders.number"), t("orders.restaurant"), t("orders.table"), t("common.total"), t("common.status"), t("orders.submitted")]}
            empty={recent.rows.length === 0 ? <Empty>{t("common.none")}</Empty> : null}>
            {recent.rows.map(({ o, name }) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td><Link href={`/admin/orders/${o.id}`} className="font-semibold text-blue-700">#{o.number}</Link></Td>
                <Td>{name}</Td><Td>{o.tableNumber}</Td>
                <Td className="tabular-nums">{fmtMoney(o.total, o.currencyDecimals, o.currencyCode)}</Td>
                <Td><Badge tone={statusTone(o.status)}>{t(`status.${o.status}` as never)}</Badge></Td>
                <Td className="text-slate-500">{fmtDate(o.submittedAt, lang)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={t("dash.attention")}>
          {offline.length === 0 ? <p className="text-sm text-emerald-700">{t("dash.noAttention")}</p> : (
            <ul className="space-y-2">
              {offline.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/restaurants/${r.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm hover:bg-amber-100">
                    <span className="font-medium">{r.nameAr}</span>
                    <span className="text-xs text-amber-800">{r.posLastSeenAt ? t("dash.offlinePos", ago(r.posLastSeenAt, lang)) : t("dash.never")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
