import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getRestaurant } from "@/server/admin";
import { serviceState } from "@/server/entitlement";
import { adminT } from "@/server/admin-lang";
import { env } from "@/lib/env";
import { Badge, statusTone } from "@/components/admin/ui";
import { CopyButton } from "@/components/admin/client";
import { RestaurantTabs } from "./tabs";

export default async function Layout(props: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const r = await getRestaurant(await getDb(), id);
  if (!r) notFound();
  const { t } = await adminT();
  const s = serviceState(r);
  const url = `${env.publicUrl}/${r.slug}`;
  const tabs: [string, string][] = [
    ["", t("tab.overview")], ["settings", t("tab.settings")], ["branding", t("tab.branding")], ["location", t("tab.location")], ["hours", t("tab.hours")],
    ["tables", t("tab.tables")], ["menu", t("tab.menu")], ["promotions", t("tab.promotions")],
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/restaurants" className="text-sm text-slate-500 hover:text-slate-800">← {t("nav.restaurants")}</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{r.nameAr} {r.nameEn && <span className="text-base font-normal text-slate-500">· {r.nameEn}</span>}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={statusTone(r.status)}>{t(`r.status.${r.status}` as never)}</Badge>
            <Badge tone={statusTone(s.reason)}>{t("svc.title")}: {t(`svc.state.${s.reason}` as never)}</Badge>
            {r.orderingPaused && <Badge tone="amber">{t("svc.paused")}</Badge>}
            <a href={url} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-blue-700 hover:underline">{url.replace(/^https?:\/\//, "")}</a>
            <CopyButton text={url} label={t("common.copy")} done={t("common.copied")} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/orders?restaurant=${r.id}`} className="btn-secondary">{t("tab.orders")}</Link>
          <Link href={`/admin/sync?restaurant=${r.id}`} className="btn-secondary">{t("tab.sync")}</Link>
          <Link href={`/admin/audit?restaurant=${r.id}`} className="btn-secondary">{t("tab.audit")}</Link>
        </div>
      </div>
      <RestaurantTabs base={`/admin/restaurants/${r.id}`} tabs={tabs} />
      <div className="mt-5">{props.children}</div>
    </>
  );
}
