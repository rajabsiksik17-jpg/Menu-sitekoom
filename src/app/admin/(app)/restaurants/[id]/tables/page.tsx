import Link from "next/link";
import { getDb } from "@/db";
import { listTables } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { Badge, Card, Empty, Table, Td, fmtDate } from "@/components/admin/ui";
import { CopyButton, RowAction } from "@/components/admin/client";
import { rotateTableAction } from "../../../../actions";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const tables = await listTables(await getDb(), id);
  const { t, lang } = await adminT();
  const qr = (uid: string, kind: string, download = false) => `/api/admin/qr?restaurant=${id}&uid=${uid}&kind=${kind}${download ? "&download=1" : ""}`;
  return (
    <Card title={t("tab.tables")} actions={tables.length > 0 && <Link href={`/admin/restaurants/${id}/tables/print`} className="btn-primary">🖨 {t("tables.printAll")}</Link>}>
      <p className="mb-4 text-sm text-slate-500">{t("tables.hint")}</p>
      <Table head={[t("tables.qr"), t("tables.number"), t("tables.name"), t("tables.seats"), t("common.status"), t("tables.url"), t("tables.rotated"), t("common.actions")]}
        empty={tables.length === 0 ? <Empty>{t("tables.none")}</Empty> : null}>
        {tables.map((tb) => (
          <tr key={tb.id} className={tb.status === "archived" ? "opacity-50" : ""}>
            <Td>
              <a href={qr(tb.posUid, "card")} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr(tb.posUid, "code") + "&size=160"} alt="" width={64} height={64} className="rounded border border-slate-200" loading="lazy" />
              </a>
            </Td>
            <Td className="text-lg font-bold">{tb.number}</Td>
            <Td>{tb.name ?? "—"}</Td>
            <Td>{tb.seats ?? "—"}</Td>
            <Td><Badge tone={tb.status === "active" ? "green" : tb.status === "inactive" ? "amber" : "gray"}>{t(`tables.status.${tb.status}` as never)}</Badge></Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                <CopyButton text={tb.url} label={t("common.copy")} done={t("common.copied")} />
                <a href={tb.url} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-3 !py-1.5 text-xs">{t("common.open")} ↗</a>
              </div>
            </Td>
            <Td className="text-xs text-slate-500">{fmtDate(tb.tokenRotatedAt, lang)}</Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                <a href={qr(tb.posUid, "card", true)} className="btn-secondary !px-3 !py-1.5 text-xs">⬇ {t("tables.card")}</a>
                <a href={qr(tb.posUid, "code", true)} className="btn-secondary !px-3 !py-1.5 text-xs">⬇ {t("tables.code")}</a>
                <RowAction action={rotateTableAction} fields={{ id, uid: tb.posUid }} label={t("tables.rotate")} confirm={t("tables.rotateConfirm")} danger />
              </div>
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
