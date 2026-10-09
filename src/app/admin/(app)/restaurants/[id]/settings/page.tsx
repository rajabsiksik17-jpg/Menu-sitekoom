import { getDb } from "@/db";
import { getRestaurant } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Card } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/client";
import { RestaurantFields } from "@/components/admin/RestaurantFields";
import { updateRestaurantAction } from "../../../../actions";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const r = await getRestaurant(await getDb(), id);
  const { t } = await adminT();
  if (!r) return null;
  return (
    <Card title={t("tab.settings")}>
      <ActionForm action={updateRestaurantAction} submit={t("common.save")}>
        <input type="hidden" name="id" value={r.id} />
        <RestaurantFields r={r} t={t} />
      </ActionForm>
    </Card>
  );
}
