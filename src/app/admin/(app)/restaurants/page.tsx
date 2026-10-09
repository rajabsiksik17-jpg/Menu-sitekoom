import Link from "next/link";
import { getDb } from "@/db";
import { listRestaurants } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Badge, Card, Empty, PageHeader, Pager, Table, Td, ago, fmtDate, statusTone } from "@/components/admin/ui";

export default async function Page(props: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const sp = await props.searchParams;
  const { t, lang } = await adminT();
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").slice(0, 60);
  const status = ["draft", "active", "suspended"].includes(sp.status ?? "") ? sp.status! : "";
  const { rows, total } = await listRestaurants(await getDb(), q, status, page);
  const online = (d: Date | null) => !!d && Date.now() - d.getTime() < 2 * 60_000;
  const href = (p: number) => `/admin/restaurants?${new URLSearchParams({ q, status, page: String(p) })}`;
  return (
    <>
      <PageHeader title={t("nav.restaurants")} subtitle={`${total}`} actions={<Link href="/admin/restaurants/new" className="btn-primary">+ {t("r.new")}</Link>} />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder={t("common.search")} className="input max-w-xs" />
          <select name="status" defaultValue={status} className="input w-auto">
            <option value="">{t("common.all")}</option>
            {["draft", "active", "suspended"].map((s) => <option key={s} value={s}>{t(`r.status.${s}` as never)}</option>)}
          </select>
          <button className="btn-secondary">{t("common.search").replace("…", "")}</button>
        </form>
        <Table head={[t("r.name"), t("r.slug"), t("svc.status"), t("svc.title"), t("pos.title"), t("stats.menuSynced")]}
          empty={rows.length === 0 ? <Empty>{t("common.none")}</Empty> : null}>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <Td><Link href={`/admin/restaurants/${r.id}`} className="font-semibold text-blue-700">{r.nameAr}</Link>{r.nameEn && <div className="text-xs text-slate-500">{r.nameEn}</div>}</Td>
              <Td><code dir="ltr" className="text-xs">{r.slug}</code></Td>
              <Td><Badge tone={statusTone(r.status)}>{t(`r.status.${r.status}` as never)}</Badge></Td>
              <Td><Badge tone={statusTone(r.service.reason)}>{t(`svc.state.${r.service.reason}` as never)}</Badge>{r.serviceExpiresAt && <div className="mt-0.5 text-xs text-slate-500">{fmtDate(r.serviceExpiresAt, lang, false)}</div>}</Td>
              <Td>{r.posLastSeenAt ? <Badge tone={online(r.posLastSeenAt) ? "green" : "amber"}>{online(r.posLastSeenAt) ? t("pos.online") : ago(r.posLastSeenAt, lang)}</Badge> : <span className="text-xs text-slate-400">{t("dash.never")}</span>}</Td>
              <Td className="text-xs text-slate-500">{r.menuSyncedAt ? ago(r.menuSyncedAt, lang) : "—"}</Td>
            </tr>
          ))}
        </Table>
        <Pager page={page} total={total} pageSize={20} href={href} labels={{ prev: t("common.prev"), next: t("common.next"), page: t("common.page", page, Math.max(1, Math.ceil(total / 20))) }} />
      </Card>
    </>
  );
}
