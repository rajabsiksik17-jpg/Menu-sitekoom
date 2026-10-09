import { getDb } from "@/db";
import { getRestaurant, listPromotions } from "@/server/admin";
import { utcToZonedInput } from "@/lib/time";
import { adminT } from "@/server/admin-lang";
import { mediaUrl } from "@/lib/media";
import { Badge, Card, Field, fmtDate } from "@/components/admin/ui";
import { ActionForm, ImageInput, RowAction } from "@/components/admin/client";
import { archivePromotionAction, savePromotionAction } from "../../../../actions";
import type { promotions } from "@/db/schema";

type P = typeof promotions.$inferSelect;

export default async function Page(props: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await props.params;
  const { edit } = await props.searchParams;
  const db = await getDb();
  const [list, r] = await Promise.all([listPromotions(db, id), getRestaurant(db, id)]);
  const tz = r?.timezone ?? "Asia/Amman";
  const { t, lang } = await adminT();
  const editing = edit === "new" ? null : list.find((p) => p.id === edit);
  const now = new Date();
  const state = (p: P) => !p.isActive ? <Badge>{t("common.no")}</Badge> : p.startsAt && p.startsAt > now ? <Badge tone="blue">{t("promo.scheduled")}</Badge>
    : p.endsAt && p.endsAt <= now ? <Badge tone="gray">{t("promo.ended")}</Badge> : <Badge tone="green">{t("promo.active")}</Badge>;
  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <Card title={t("tab.promotions")} className="xl:col-span-3" actions={<a href="?edit=new" className="btn-primary">+ {t("promo.new")}</a>}>
        {list.length === 0 ? <p className="text-sm text-slate-500">{t("promo.none")}</p> : (
          <ul className="space-y-3">
            {list.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(p.imageMediaId, "sm")!} alt="" className="h-16 w-28 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.titleAr ?? p.titleEn ?? "—"}</div>
                  <div className="text-xs text-slate-500">#{p.sort} · {p.startsAt ? fmtDate(p.startsAt, lang) : "∞"} → {p.endsAt ? fmtDate(p.endsAt, lang) : "∞"}</div>
                </div>
                {state(p)}
                <a href={`?edit=${p.id}`} className="btn-secondary !px-3 !py-1.5 text-xs">{t("common.edit")}</a>
                <RowAction action={archivePromotionAction} fields={{ id, promotionId: p.id }} label={t("common.archive")} confirm={t("common.confirm")} danger />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {(edit === "new" || editing) && (
        <Card title={editing ? t("common.edit") : t("promo.new")} className="xl:col-span-2">
          <ActionForm action={savePromotionAction} submit={t("common.save")} key={edit}>
            <input type="hidden" name="id" value={id} />
            {editing && <input type="hidden" name="promotionId" value={editing.id} />}
            <Field label={t("promo.image")}><ImageInput name="image" current={mediaUrl(editing?.imageMediaId, "sm")} label={t("brand.upload")} /></Field>
            <Field label={t("promo.mobile")}><ImageInput name="mobileImage" current={mediaUrl(editing?.mobileImageMediaId, "sm")} label={t("brand.upload")} removeName="removeMobile" removeLabel={t("brand.remove")} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("promo.titleAr")}><input name="titleAr" maxLength={80} defaultValue={editing?.titleAr ?? ""} className="input" /></Field>
              <Field label={t("promo.titleEn")}><input name="titleEn" maxLength={80} dir="ltr" defaultValue={editing?.titleEn ?? ""} className="input" /></Field>
              <Field label={t("promo.subAr")}><input name="subtitleAr" maxLength={160} defaultValue={editing?.subtitleAr ?? ""} className="input" /></Field>
              <Field label={t("promo.subEn")}><input name="subtitleEn" maxLength={160} dir="ltr" defaultValue={editing?.subtitleEn ?? ""} className="input" /></Field>
              <Field label={t("promo.ctaAr")}><input name="ctaAr" maxLength={30} defaultValue={editing?.ctaAr ?? ""} className="input" /></Field>
              <Field label={t("promo.ctaEn")}><input name="ctaEn" maxLength={30} dir="ltr" defaultValue={editing?.ctaEn ?? ""} className="input" /></Field>
            </div>
            <Field label={t("promo.target")} hint={t("promo.targetHint")}><input name="ctaTarget" maxLength={300} dir="ltr" defaultValue={editing?.ctaTarget ?? ""} className="input" /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("promo.sort")}><input name="sort" type="number" min={0} max={999} defaultValue={editing?.sort ?? 0} className="input" /></Field>
              <Field label={t("promo.starts")}><input name="startsAt" type="datetime-local" defaultValue={utcToZonedInput(editing?.startsAt, tz)} className="input" /></Field>
              <Field label={t("promo.ends")}><input name="endsAt" type="datetime-local" defaultValue={utcToZonedInput(editing?.endsAt, tz)} className="input" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} /> {t("promo.active")}</label>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
