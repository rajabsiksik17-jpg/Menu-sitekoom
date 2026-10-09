import type { restaurants } from "@/db/schema";
import type { AdminKey } from "@/lib/admin-i18n";
import { Field } from "./ui";

type R = Partial<typeof restaurants.$inferSelect>;

/** Fields of the restaurant form (shared by "new" and "details"). */
export function RestaurantFields({ r, t }: { r?: R; t: (k: AdminKey) => string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={t("r.nameAr")}><input name="nameAr" required maxLength={120} defaultValue={r?.nameAr ?? ""} className="input" /></Field>
      <Field label={t("r.nameEn")}><input name="nameEn" maxLength={120} defaultValue={r?.nameEn ?? ""} dir="ltr" className="input" /></Field>
      <Field label={t("r.slug")} hint={t("r.slugHint")}>
        <input name="slug" required pattern="[a-z0-9](?:[a-z0-9\-]{0,58}[a-z0-9])?" maxLength={60} defaultValue={r?.slug ?? ""} dir="ltr" className="input" />
      </Field>
      <Field label={t("r.installation")} hint={t("r.installationHint")}>
        <input name="installationCode" maxLength={64} defaultValue={r?.installationCode ?? ""} dir="ltr" className="input uppercase" />
      </Field>
      <Field label={t("r.descAr")}><textarea name="descriptionAr" maxLength={500} rows={2} defaultValue={r?.descriptionAr ?? ""} className="input" /></Field>
      <Field label={t("r.descEn")}><textarea name="descriptionEn" maxLength={500} rows={2} defaultValue={r?.descriptionEn ?? ""} dir="ltr" className="input" /></Field>
      <Field label={t("r.phone")}><input name="phone" maxLength={30} defaultValue={r?.phone ?? ""} dir="ltr" className="input" /></Field>
      <Field label={t("r.whatsapp")}><input name="whatsapp" maxLength={30} defaultValue={r?.whatsapp ?? ""} dir="ltr" placeholder="9627…" className="input" /></Field>
      <Field label={t("r.address")}><input name="address" maxLength={200} defaultValue={r?.address ?? ""} className="input" /></Field>
      <Field label={t("r.licenseCustomer")}><input name="licenseCustomer" maxLength={120} defaultValue={r?.licenseCustomer ?? ""} className="input" /></Field>
      <Field label={t("r.defaultLang")}>
        <select name="defaultLang" defaultValue={r?.defaultLang ?? "ar"} className="input"><option value="ar">العربية</option><option value="en">English</option></select>
      </Field>
      <Field label={t("r.languages")}>
        <div className="flex gap-4 py-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="languages" value="ar" defaultChecked={(r?.languages ?? ["ar", "en"]).includes("ar")} /> العربية</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="languages" value="en" defaultChecked={(r?.languages ?? ["ar", "en"]).includes("en")} /> English</label>
        </div>
      </Field>
      <Field label={t("r.timezone")}><input name="timezone" defaultValue={r?.timezone ?? "Asia/Amman"} dir="ltr" className="input" /></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="showContact" defaultChecked={r?.showContact ?? true} /> {t("r.showContact")}</label>
      <Field label={t("r.invoiceVisible")} hint={t("r.invoiceVisibleHint")}>
        <input name="invoiceVisibleMinutes" type="number" min={0} max={1440} step={1} required defaultValue={r?.invoiceVisibleMinutes ?? 15} dir="ltr" className="input" />
      </Field>
      <Field label={t("r.sessionIdle")} hint={t("r.sessionIdleHint")}>
        <input name="sessionIdleMinutes" type="number" min={30} max={1440} step={5} required defaultValue={r?.sessionIdleMinutes ?? 240} dir="ltr" className="input" />
      </Field>
    </div>
  );
}
