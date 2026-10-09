import { getDb } from "@/db";
import { getRestaurant, listMenu } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Badge, Card, Empty, Table, Td, fmtMoney } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/client";
import { updatePresentationAction } from "../../../../actions";

export default async function Page(props: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; c?: string }> }) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const db = await getDb();
  const [r, { cats, prods }] = await Promise.all([getRestaurant(db, id), listMenu(db, id)]);
  const { t } = await adminT();
  if (!r) return null;
  const q = (sp.q ?? "").trim().toLowerCase();
  const c = sp.c ? Number(sp.c) : null;
  const catName = new Map(cats.map((x) => [x.posId, x.nameAr]));
  const list = prods.filter((p) => (!q || p.nameAr.toLowerCase().includes(q) || (p.nameEn ?? "").toLowerCase().includes(q)) && (c == null || p.categoryPosId === c));
  return (
    <Card title={`${t("tab.menu")} · ${prods.filter((p) => p.isActive).length}`}>
      <p className="mb-4 text-sm text-slate-500">{t("menu.hint")}</p>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder={t("common.search")} className="input max-w-xs" />
        <select name="c" defaultValue={sp.c ?? ""} className="input w-auto">
          <option value="">{t("common.all")}</option>
          {cats.map((x) => <option key={x.posId} value={x.posId}>{x.icon} {x.nameAr}{x.isActive ? "" : ` (${t("menu.inactive")})`}</option>)}
        </select>
        <button className="btn-secondary">{t("common.search").replace("…", "")}</button>
      </form>
      <Table head={[t("menu.product"), t("menu.category"), t("menu.price"), t("menu.prep"), t("common.status"), `${t("menu.featured")} / ${t("menu.new")} / ${t("menu.labelAr")}`]}
        empty={list.length === 0 ? <Empty>{prods.length ? t("common.none") : t("menu.empty")}</Empty> : null}>
        {list.map((p) => (
          <tr key={p.id} className={p.isActive ? "" : "opacity-50"}>
            <Td>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.imageSha ? <img src={`/media/s/${id}/${p.imageSha}?s=sm`} alt="" className="size-10 rounded-lg object-cover" loading="lazy" /> : <div className="size-10 rounded-lg bg-slate-100" />}
                <div><div className="font-medium">{p.nameAr}</div>{p.nameEn && <div className="text-xs text-slate-500">{p.nameEn}</div>}</div>
              </div>
            </Td>
            <Td>{p.categoryPosId != null ? catName.get(p.categoryPosId) ?? "—" : "—"}</Td>
            <Td className="tabular-nums">{fmtMoney(p.price, r.currencyDecimals, r.currencySymbol)}</Td>
            <Td>{p.prepMinutes ?? `${r.defaultPrepMinutes}*`}</Td>
            <Td>{!p.isActive ? <Badge>{t("menu.inactive")}</Badge> : p.isAvailable ? <Badge tone="green">{t("menu.available")}</Badge> : <Badge tone="amber">✕</Badge>}</Td>
            <Td>
              <ActionForm action={updatePresentationAction} submit={t("common.save")} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="productPosId" value={p.posId} />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isFeatured" defaultChecked={p.isFeatured} />⭐</label>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isNew" defaultChecked={p.isNew} />{t("menu.new")}</label>
                <input name="labelAr" defaultValue={p.labelAr ?? ""} maxLength={30} placeholder={t("menu.labelAr")} className="input !w-28 !py-1 text-xs" />
                <input name="labelEn" defaultValue={p.labelEn ?? ""} maxLength={30} placeholder={t("menu.labelEn")} dir="ltr" className="input !w-28 !py-1 text-xs" />
              </ActionForm>
            </Td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-slate-500">* {t("menu.prep")}: {r.defaultPrepMinutes}</p>
    </Card>
  );
}
