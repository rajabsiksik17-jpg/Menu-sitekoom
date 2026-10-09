import Link from "next/link";
import { getDb } from "@/db";
import { listOrders, listRestaurants } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Badge, Card, Empty, PageHeader, Pager, Table, Td, fmtDate, fmtMoney, statusTone } from "@/components/admin/ui";

const STATUSES = ["submitted", "delivered", "accepted", "preparing", "ready", "completed", "rejected", "cancelled"];

export default async function Page(props: { searchParams: Promise<{ restaurant?: string; status?: string; q?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const { t, lang } = await adminT();
  const db = await getDb();
  const page = Math.max(1, Number(sp.page) || 1);
  const restaurantId = /^[0-9a-f-]{36}$/.test(sp.restaurant ?? "") ? sp.restaurant : undefined;
  const status = STATUSES.includes(sp.status ?? "") ? sp.status : undefined;
  const q = (sp.q ?? "").slice(0, 10);
  const [{ rows, total }, rests] = await Promise.all([listOrders(db, { restaurantId, status, q, page }), listRestaurants(db, "", "", 1, 200)]);
  const href = (p: number) => `/admin/orders?${new URLSearchParams({ ...(restaurantId ? { restaurant: restaurantId } : {}), ...(status ? { status } : {}), q, page: String(p) })}`;
  return (
    <>
      <PageHeader title={t("nav.orders")} subtitle={`${total}`} />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <select name="restaurant" defaultValue={restaurantId ?? ""} className="input w-auto">
            <option value="">{t("common.all")}</option>
            {rests.rows.map((r) => <option key={r.id} value={r.id}>{r.nameAr}</option>)}
          </select>
          <select name="status" defaultValue={status ?? ""} className="input w-auto">
            <option value="">{t("common.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as never)}</option>)}
          </select>
          <input name="q" defaultValue={q} inputMode="numeric" placeholder={`${t("orders.number")} / ${t("orders.table")}`} className="input w-44" />
          <button className="btn-secondary">{t("common.search").replace("…", "")}</button>
        </form>
        <Table head={[t("orders.number"), t("orders.restaurant"), t("orders.table"), t("common.total"), t("common.status"), t("orders.eta"), t("orders.submitted")]}
          empty={rows.length === 0 ? <Empty>{t("common.none")}</Empty> : null}>
          {rows.map(({ o, name }) => (
            <tr key={o.id} className="hover:bg-slate-50">
              <Td><Link href={`/admin/orders/${o.id}`} className="font-semibold text-blue-700">#{o.number}</Link></Td>
              <Td>{name}</Td>
              <Td>{o.tableNumber}{o.groupLabel && <span className="ms-1 text-xs text-slate-500">({o.groupLabel})</span>}</Td>
              <Td className="tabular-nums">{fmtMoney(o.total, o.currencyDecimals, o.currencyCode)}</Td>
              <Td><Badge tone={statusTone(o.status)}>{t(`status.${o.status}` as never)}</Badge></Td>
              <Td className="text-xs">{o.estimatedReadyAt ? fmtDate(o.estimatedReadyAt, lang) : "—"}</Td>
              <Td className="text-xs text-slate-500">{fmtDate(o.submittedAt, lang)}</Td>
            </tr>
          ))}
        </Table>
        <Pager page={page} total={total} pageSize={25} href={href} labels={{ prev: t("common.prev"), next: t("common.next"), page: t("common.page", page, Math.max(1, Math.ceil(total / 25))) }} />
      </Card>
    </>
  );
}
