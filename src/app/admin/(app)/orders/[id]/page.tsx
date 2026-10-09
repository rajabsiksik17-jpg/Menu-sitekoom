import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getOrder } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Badge, Card, PageHeader, Table, Td, fmtDate, fmtMoney, statusTone } from "@/components/admin/ui";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getOrder(await getDb(), id);
  if (!data) notFound();
  const { t, lang } = await adminT();
  const { o, r, items, events } = data;
  const m = (v: number) => fmtMoney(v, o.currencyDecimals, r.currencySymbol);
  const rows: [string, React.ReactNode][] = [
    [t("orders.restaurant"), <Link key="r" href={`/admin/restaurants/${r.id}`} className="text-blue-700">{r.nameAr}</Link>],
    [t("orders.table"), `${o.tableNumber}${o.groupLabel ? ` · ${o.groupLabel}` : ""}`],
    [t("common.status"), <Badge key="s" tone={statusTone(o.status)}>{t(`status.${o.status}` as never)}</Badge>],
    [t("orders.submitted"), fmtDate(o.submittedAt, lang)],
    [t("orders.eta"), o.estimatedReadyAt ? `${fmtDate(o.estimatedReadyAt, lang)}${o.prepMinutes ? ` (${o.prepMinutes}′)` : ""}` : "—"],
    [t("orders.posId"), o.posOrderId ?? "—"],
    [t("orders.reason"), o.reason ?? "—"],
    [t("orders.note"), o.note ?? "—"],
    [t("orders.location"), o.location ? `${o.location.inside ? t("orders.inside") : t("orders.outside")} · ±${Math.round(o.location.accuracy)} m${o.location.distanceM ? ` · ${o.location.distanceM} m` : ""}` : "—"],
  ];
  return (
    <>
      <PageHeader title={`${t("orders.number")} #${o.number}`} subtitle={<span dir="ltr" className="font-mono text-xs">{o.id}</span>} actions={<Link href="/admin/orders" className="btn-secondary">{t("common.back")}</Link>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title={t("common.details")}>
          <dl className="space-y-2 text-sm">
            {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-end font-medium">{v}</dd></div>)}
          </dl>
        </Card>
        <Card title={t("orders.items")} className="xl:col-span-2">
          <Table head={[t("menu.product"), "×", t("menu.price"), t("menu.prep"), t("common.total")]}>
            {items.map((i) => (
              <tr key={i.id}>
                <Td>
                  <div className="font-medium">{i.nameAr}{i.variantName && <span className="text-slate-500"> · {i.variantName}</span>}</div>
                  {i.modifiers.length > 0 && <div className="text-xs text-slate-500">{i.modifiers.map((x) => `${x.group}: ${x.name}${x.priceDelta ? ` (+${m(x.priceDelta)})` : ""}`).join(" · ")}</div>}
                  {i.note && <div className="text-xs italic text-slate-500">“{i.note}”</div>}
                </Td>
                <Td>{i.quantity}</Td><Td className="tabular-nums">{m(i.unitPrice)}</Td><Td>{i.prepMinutes}′</Td><Td className="tabular-nums font-medium">{m(i.lineTotal)}</Td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 flex justify-end gap-6 text-base font-bold"><span>{t("common.total")}</span><span className="tabular-nums">{m(o.total)}</span></div>
        </Card>
        <Card title={t("orders.history")} className="xl:col-span-3">
          <ol className="relative space-y-3 border-s border-slate-200 ps-5">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <span className="absolute -start-1.5 mt-1.5 size-3 rounded-full bg-blue-600" />
                <Badge tone={statusTone(e.status)}>{t(`status.${e.status}` as never)}</Badge>
                <span className="ms-2 text-slate-500">{fmtDate(e.at, lang)} · {e.actor}</span>
                {e.note && <span className="ms-2">{e.note}</span>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
