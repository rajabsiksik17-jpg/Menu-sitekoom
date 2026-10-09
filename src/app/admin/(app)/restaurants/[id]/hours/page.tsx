import { getDb } from "@/db";
import { getRestaurant } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Card } from "@/components/admin/ui";
import { HoursEditor } from "./HoursEditor";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const r = await getRestaurant(await getDb(), id);
  const { t } = await adminT();
  if (!r) return null;
  return (
    <Card title={t("hours.title")}>
      <p className="mb-4 text-sm text-slate-500">{t("hours.hint")}</p>
      <HoursEditor id={r.id} initial={r.openingHours ?? []} days={[0, 1, 2, 3, 4, 5, 6].map((d) => t(`day.${d}` as never))}
        labels={{ add: t("hours.add"), day: t("hours.day"), open: t("hours.open"), close: t("hours.close"), save: t("common.save"), remove: t("common.delete") }} />
    </Card>
  );
}
