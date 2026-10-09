import { getDb } from "@/db";
import { getRestaurant } from "@/server/admin";
import { DEFAULT_THEME } from "@/server/menu";
import { adminT } from "@/server/admin-lang";
import { mediaUrl } from "@/lib/media";
import { Card, Field } from "@/components/admin/ui";
import { ActionForm, ImageInput } from "@/components/admin/client";
import { updateBrandingAction } from "../../../../actions";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const r = await getRestaurant(await getDb(), id);
  const { t } = await adminT();
  if (!r) return null;
  const th = { ...DEFAULT_THEME, ...r.theme };
  const select = (name: string, value: string, options: string[], prefix: string) => (
    <select name={name} defaultValue={value} className="input">
      {options.map((o) => <option key={o} value={o}>{t(`${prefix}.${o}` as never)}</option>)}
    </select>
  );
  return (
    <Card title={t("tab.branding")} actions={<a href={`/${r.slug}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">{t("brand.preview")} ↗</a>}>
      <ActionForm action={updateBrandingAction} submit={t("common.save")}>
        <input type="hidden" name="id" value={r.id} />
        <div className="grid gap-6 md:grid-cols-2">
          <Field label={t("brand.logo")}><ImageInput name="logo" current={mediaUrl(r.logoMediaId, "sm")} label={t("brand.upload")} removeName="removeLogo" removeLabel={t("brand.remove")} /></Field>
          <Field label={t("brand.cover")}><ImageInput name="cover" current={mediaUrl(r.coverMediaId, "sm")} label={t("brand.upload")} removeName="removeCover" removeLabel={t("brand.remove")} /></Field>
          <Field label={t("brand.primary")}><input type="color" name="primary" defaultValue={th.primary} className="h-11 w-24 cursor-pointer rounded-lg border border-slate-300" /></Field>
          <Field label={t("brand.secondary")}><input type="color" name="secondary" defaultValue={th.secondary} className="h-11 w-24 cursor-pointer rounded-lg border border-slate-300" /></Field>
          <Field label={t("brand.background")}>{select("background", th.background, ["light", "warm", "dark"], "brand.bg")}</Field>
          <Field label={t("brand.button")}>{select("buttonStyle", th.buttonStyle, ["rounded", "pill", "square"], "brand.btn")}</Field>
          <Field label={t("brand.card")}>{select("cardStyle", th.cardStyle, ["elevated", "flat", "outline"], "brand.card")}</Field>
          <Field label={t("brand.layout")}>{select("layout", th.layout, ["grid", "list"], "brand.layout")}</Field>
        </div>
      </ActionForm>
    </Card>
  );
}
