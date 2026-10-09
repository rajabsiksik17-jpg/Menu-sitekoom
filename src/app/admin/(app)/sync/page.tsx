import Link from "next/link";
import { getDb } from "@/db";
import { listSyncLogs } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Badge, Card, Empty, PageHeader, Table, Td, fmtDate } from "@/components/admin/ui";

export default async function Page(props: { searchParams: Promise<{ restaurant?: string; errors?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const { t, lang } = await adminT();
  const rid = /^[0-9a-f-]{36}$/.test(sp.restaurant ?? "") ? sp.restaurant : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listSyncLogs(await getDb(), rid, sp.errors === "1", page);
  const qs = (p: Record<string, string>) => `/admin/sync?${new URLSearchParams({ ...(rid ? { restaurant: rid } : {}), ...(sp.errors === "1" ? { errors: "1" } : {}), ...p })}`;
  return (
    <>
      <PageHeader title={t("nav.sync")} actions={
        <Link href={sp.errors === "1" ? qs({ errors: "" }).replace("errors=&", "").replace("&errors=", "") : qs({ errors: "1" })} className="btn-secondary">
          {sp.errors === "1" ? t("common.all") : t("sync.onlyErrors")}
        </Link>} />
      <Card>
        <p className="mb-4 text-sm text-slate-500">{t("sync.retryHint")}</p>
        <Table head={[t("common.date"), t("orders.restaurant"), t("sync.kind"), t("common.status"), t("sync.detail")]} empty={rows.length === 0 ? <Empty>{t("common.none")}</Empty> : null}>
          {rows.map(({ l, name }) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(l.at, lang)}</Td>
              <Td>{name ? <Link href={`/admin/restaurants/${l.restaurantId}`} className="text-blue-700">{name}</Link> : "—"}</Td>
              <Td><code className="text-xs">{l.kind}</code></Td>
              <Td><Badge tone={l.ok ? "green" : "red"}>{l.ok ? t("sync.ok") : t("sync.fail")}</Badge></Td>
              <Td className="text-xs">{l.detail}</Td>
            </tr>
          ))}
        </Table>
        <div className="mt-4 flex gap-2">
          {page > 1 && <Link href={qs({ page: String(page - 1) })} className="btn-secondary">{t("common.prev")}</Link>}
          {rows.length === 50 && <Link href={qs({ page: String(page + 1) })} className="btn-secondary">{t("common.next")}</Link>}
        </div>
      </Card>
    </>
  );
}
