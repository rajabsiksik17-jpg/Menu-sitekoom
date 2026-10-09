import { getDb } from "@/db";
import { listTables } from "@/server/admin";
import { adminT } from "@/server/admin-lang";
import { PrintButton } from "./PrintButton";

/** All active tables' QR cards on A4 pages (4 per page) — print from the browser. */
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const tables = (await listTables(await getDb(), id)).filter((t) => t.status === "active");
  const { t } = await adminT();
  return (
    <div>
      <div className="no-print mb-4 flex items-center gap-3">
        <PrintButton label={`🖨 ${t("tables.printAll")}`} />
        <span className="text-sm text-slate-500">{tables.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-6 print:gap-4">
        {tables.map((tb) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={tb.id} src={`/api/admin/qr?restaurant=${id}&uid=${tb.posUid}&kind=card`} alt={`${tb.number}`} className="w-full break-inside-avoid rounded-xl border border-slate-200 print:rounded-none print:border-0" />
        ))}
      </div>
    </div>
  );
}
