import { getDb } from "@/db";
import { getRestaurant, restaurantOverview } from "@/server/admin";
import { utcToZonedInput } from "@/lib/time";
import { adminT } from "@/server/admin-lang";
import { Badge, Card, Field, Stat, Table, Td, ago, fmtDate, fmtMoney, statusTone } from "@/components/admin/ui";
import { ActionForm, RowAction } from "@/components/admin/client";
import { revokeDeviceAction, updateServiceAction } from "../../../actions";
import { EnrollmentCode } from "./EnrollmentCode";

export default async function Overview(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const db = await getDb();
  const [r, o] = await Promise.all([getRestaurant(db, id), restaurantOverview(db, id)]);
  const { t, lang } = await adminT();
  if (!r) return null;
  const active = (s: string) => o.ordersByStatus.find((x) => x.status === s)?.n ?? 0;
  const online = (d: Date | null) => !!d && Date.now() - d.getTime() < 2 * 60_000;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label={t("stats.tables")} value={o.tables} />
        <Stat label={t("stats.categories")} value={o.categories} />
        <Stat label={t("stats.products")} value={o.products} />
        <Stat label={t("stats.today")} value={`${o.today.n} · ${fmtMoney(Number(o.today.total), r.currencyDecimals, r.currencyCode)}`} />
        <Stat label={t("stats.menuSynced")} value={<span className="text-base">{r.menuSyncedAt ? ago(r.menuSyncedAt, lang) : "—"}</span>} />
      </div>
      {(active("submitted") > 0 || active("delivered") > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {["submitted", "delivered", "accepted", "preparing", "ready"].map((s) => active(s) > 0 && <Badge key={s} tone={statusTone(s)}>{t(`status.${s}` as never)}: {active(s)}</Badge>)}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t("svc.title")}>
          <ActionForm action={updateServiceAction} submit={t("common.save")}>
            <input type="hidden" name="id" value={r.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("svc.status")}>
                <select name="status" defaultValue={r.status} className="input">
                  {["draft", "active", "suspended"].map((s) => <option key={s} value={s}>{t(`r.status.${s}` as never)}</option>)}
                </select>
              </Field>
              <Field label={t("svc.expires")} hint={t("svc.expiresHint")}>
                <input type="date" name="serviceExpiresAt" defaultValue={r.serviceExpiresAt ? utcToZonedInput(r.serviceExpiresAt, r.timezone).slice(0, 10) : ""} className="input" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="orderingPaused" defaultChecked={r.orderingPaused} /> {t("svc.paused")}</label>
            <p className="text-xs text-slate-500">{t("svc.policy")}</p>
          </ActionForm>
        </Card>
        <Card title={t("pos.title")}>
          <EnrollmentCode id={r.id} labels={{ create: t("pos.code"), hint: t("pos.codeHint"), shown: t("pos.codeShown"), valid: t("pos.validUntil", "{0}") }} />
          <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-700">{t("pos.devices")}</h3>
          {o.devices.length === 0 ? <p className="text-sm text-slate-500">{t("pos.noDevices")}</p> : (
            <Table head={["", t("pos.installation"), t("pos.lastSeen"), t("common.status"), ""]}>
              {o.devices.map((d) => (
                <tr key={d.id}>
                  <Td><div className="font-medium">{d.name}</div><div className="text-xs text-slate-500">{d.appVersion ?? ""} · {fmtDate(d.createdAt, lang, false)}</div></Td>
                  <Td><code dir="ltr" className="text-xs">{d.installationCode ?? "—"}</code></Td>
                  <Td>{d.status === "active" ? <Badge tone={online(d.lastSeenAt) ? "green" : "amber"}>{online(d.lastSeenAt) ? t("pos.online") : ago(d.lastSeenAt, lang)}</Badge> : "—"}</Td>
                  <Td><Badge tone={d.status === "active" ? "green" : "red"}>{d.status === "active" ? t("pos.active") : t("pos.revoked")}</Badge></Td>
                  <Td>{d.status === "active" && <RowAction action={revokeDeviceAction} fields={{ id: r.id, deviceId: d.id }} label={t("pos.revoke")} confirm={t("pos.revokeConfirm")} danger />}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      <Card title={t("nav.sync")}>
        {o.recentSync.length === 0 ? <p className="text-sm text-slate-500">{t("common.none")}</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {o.recentSync.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                <Badge tone={s.ok ? "green" : "red"}>{s.ok ? t("sync.ok") : t("sync.fail")}</Badge>
                <span className="font-mono text-xs">{s.kind}</span>
                <span className="flex-1 text-slate-600">{s.detail}</span>
                <span className="text-xs text-slate-400">{ago(s.at, lang)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">{t("sync.retryHint")}</p>
      </Card>
    </div>
  );
}
