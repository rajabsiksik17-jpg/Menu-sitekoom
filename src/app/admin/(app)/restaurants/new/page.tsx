import { adminT } from "@/server/admin-lang";
import { Card, PageHeader } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/client";
import { RestaurantFields } from "@/components/admin/RestaurantFields";
import { createRestaurantAction } from "../../../actions";

export default async function Page() {
  const { t } = await adminT();
  return (
    <>
      <PageHeader title={t("r.new")} />
      <Card>
        <ActionForm action={createRestaurantAction} submit={t("common.save")}>
          <RestaurantFields t={t} />
        </ActionForm>
      </Card>
    </>
  );
}
