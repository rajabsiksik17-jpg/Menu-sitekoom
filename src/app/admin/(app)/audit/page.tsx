import Link from "next/link";
import { getDb } from "@/db";
import { listAudit } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Card, Empty, PageHeader, Table, Td, fmtDate } from "@/components/admin/ui";

export default async function Page(props: { searchParams: Promise<{ restaurant?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const { t, lang } = await adminT();
  const rid = /^[0-9a-f-]{36}$/.test(sp.restaurant ?? "") ? sp.restaurant : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listAudit(await getDb(), rid, page);
  const qs = (p: number) => `/admin/audit?${new URLSearchParams({ ...(rid ? { restaurant: rid } : {}), page: String(p) })}`;
  return (
    <>
      <PageHeader title={t("nav.audit")} />
      <Card>
        <Table head={[t("common.date"), t("orders.restaurant"), t("audit.actor"), t("audit.action"), t("common.details")]} empty={rows.length === 0 ? <Empty>{t("common.none")}</Empty> : null}>
          {rows.map(({ a, name }) => (
            <tr key={a.id}>
              <Td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(a.at, lang)}</Td>
              <Td>{name ? <Link href={`/admin/restaurants/${a.restaurantId}`} className="text-blue-700">{name}</Link> : "—"}</Td>
              <Td className="text-xs">{a.actorType}{a.ip && a.ip !== "local" ? ` · ${a.ip}` : ""}</Td>
              <Td><code className="text-xs">{a.action}</code></Td>
              <Td className="max-w-md truncate font-mono text-[11px] text-slate-600"><span dir="ltr">{a.details ? JSON.stringify(a.details) : ""}</span></Td>
            </tr>
          ))}
        </Table>
        <div className="mt-4 flex gap-2">
          {page > 1 && <Link href={qs(page - 1)} className="btn-secondary">{t("common.prev")}</Link>}
          {rows.length === 50 && <Link href={qs(page + 1)} className="btn-secondary">{t("common.next")}</Link>}
        </div>
      </Card>
    </>
  );
}
