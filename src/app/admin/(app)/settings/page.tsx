import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platformAdmins } from "@/db/schema";
import { requireAdmin } from "@/server/admin-auth";
import { listAdmins, listSessions } from "@/server/admins";
import { adminT } from "@/server/admin-lang";
import { env } from "@/lib/env";
import { Badge, Card, Field, PageHeader, Table, Td, ago, fmtDate } from "@/components/admin/ui";
import { ActionForm, RowAction } from "@/components/admin/client";
import { addAdminAction, changePasswordAction, setAdminActiveAction, signOutOthersAction } from "../../actions";
import { TotpPanel } from "./SecurityPanel";
import pkg from "../../../../../package.json";

export default async function Page() {
  const me = await requireAdmin();
  const { t, lang } = await adminT();
  const db = await getDb();
  const [admins, sessions, [mine]] = await Promise.all([
    listAdmins(db), listSessions(db, me.id),
    db.select({ totpEnabled: platformAdmins.totpEnabled }).from(platformAdmins).where(eq(platformAdmins.id, me.id)).limit(1),
  ]);
  const dbInfo = env.databaseUrl.startsWith("postgres") ? `PostgreSQL (${new URL(env.databaseUrl).host})` : "PGlite (embedded, development)";
  const totpLabels = {
    on: t("sec.totpOn"), off: t("sec.totpOff"), enable: t("sec.enable"), scan: t("sec.scan"), manual: t("sec.manual"), confirm: t("sec.confirm"),
    disable: t("sec.disable"), code: t("sec.code"), password: t("sec.password"),
  };
  return (
    <>
      <PageHeader title={t("nav.settings")} subtitle={t("sec.policy")} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={`🔐 ${t("sec.totp")}`}>
          <TotpPanel enabled={!!mine?.totpEnabled} labels={totpLabels} />
        </Card>
        <Card title={t("set.password")}>
          <ActionForm action={changePasswordAction} submit={t("common.save")}>
            <Field label={t("set.current")}><input type="password" name="current" required autoComplete="current-password" className="input" /></Field>
            <Field label={t("sec.newPassword")}><input type="password" name="next" required minLength={12} autoComplete="new-password" className="input" /></Field>
          </ActionForm>
        </Card>
        <Card title={t("sec.sessions")} actions={sessions.length > 1 && <RowAction action={signOutOthersAction} fields={{}} label={t("sec.signOutOthers")} danger />}>
          <ul className="divide-y divide-slate-100 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="truncate text-slate-600" dir="ltr">{s.userAgent?.slice(0, 70) ?? "—"}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {s.ip && s.ip !== "local" && <span dir="ltr">{s.ip}</span>}{ago(s.createdAt, lang)}
                  {s.id === me.sessionId && <Badge tone="green">{t("sec.thisSession")}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("set.platform")}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{t("set.publicUrl")}</dt><dd dir="ltr">{env.publicUrl}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{t("set.database")}</dt><dd dir="ltr">{dbInfo}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{t("set.version")}</dt><dd dir="ltr">{pkg.version}</dd></div>
          </dl>
        </Card>
        <Card title={t("sec.admins")} className="xl:col-span-2">
          <Table head={[t("sec.name"), t("sec.email"), t("sec.totp"), t("common.status"), t("pos.lastSeen"), ""]}>
            {admins.map((a) => (
              <tr key={a.id}>
                <Td>{a.name} {a.id === me.id && <Badge tone="blue">{t("sec.you")}</Badge>}</Td>
                <Td><span dir="ltr">{a.email}</span></Td>
                <Td>{a.totpEnabled ? <Badge tone="green">✓</Badge> : <Badge tone="amber">✕</Badge>}</Td>
                <Td>
                  {a.lockedUntil && a.lockedUntil > new Date() ? <Badge tone="red">{t("sec.locked")}</Badge>
                    : <Badge tone={a.isActive ? "green" : "gray"}>{a.isActive ? t("sec.active") : t("sec.inactive")}</Badge>}
                </Td>
                <Td className="text-xs text-slate-500">{fmtDate(a.lastLoginAt, lang)}</Td>
                <Td>
                  {a.id !== me.id && (
                    <RowAction action={setAdminActiveAction} fields={{ adminId: a.id, active: a.isActive ? "false" : "true" }}
                      label={a.isActive ? t("sec.disableAdmin") : t("sec.enableAdmin")} confirm={a.isActive ? t("common.confirm") : undefined} danger={a.isActive} />
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">{t("sec.addAdmin")}</h3>
          <ActionForm action={addAdminAction} submit={t("sec.addAdmin")} className="grid gap-3 md:grid-cols-4 md:items-end">
            <Field label={t("sec.name")}><input name="name" required maxLength={80} className="input" /></Field>
            <Field label={t("sec.email")}><input name="email" type="email" required dir="ltr" className="input" /></Field>
            <Field label={t("sec.newPassword")}><input name="password" type="password" required minLength={12} autoComplete="new-password" className="input" /></Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
