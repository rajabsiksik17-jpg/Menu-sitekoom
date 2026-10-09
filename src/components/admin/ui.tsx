import Link from "next/link";

/** Small server-safe building blocks of the dashboard (no client JS). */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, actions, className = "" }: { title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const tones = {
  gray: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700", blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export const statusTone = (s: string): Tone =>
  ({ submitted: "amber", delivered: "blue", accepted: "violet", preparing: "violet", ready: "green", completed: "gray", rejected: "red", cancelled: "red", active: "green", draft: "gray", suspended: "red", expired: "red" } as Record<string, Tone>)[s] ?? "gray";

export function Stat({ label, value, tone, href }: { label: string; value: React.ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm transition ${href ? "hover:border-blue-300" : ""} ${tone === "red" ? "border-red-200" : tone === "amber" ? "border-amber-200" : "border-slate-200"}`}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2.5 text-start font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-middle ${className}`}>{children}</td>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function Pager({ page, total, pageSize, href, labels }: { page: number; total: number; pageSize: number; href: (p: number) => string; labels: { prev: string; next: string; page: string } }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-slate-500">{labels.page}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn-secondary" href={href(page - 1)}>{labels.prev}</Link> : <span className="btn-secondary opacity-40">{labels.prev}</span>}
        {page < pages ? <Link className="btn-secondary" href={href(page + 1)}>{labels.next}</Link> : <span className="btn-secondary opacity-40">{labels.next}</span>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function fmtDate(d: Date | string | null | undefined, lang: string, withTime = true) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB", withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Amman" } : { dateStyle: "medium", timeZone: "Asia/Amman" });
}

export function fmtMoney(minor: number, decimals: number, symbol: string) {
  return `${(minor / 10 ** decimals).toFixed(decimals)} ${symbol}`;
}

export function ago(d: Date | null | undefined, lang: string) {
  if (!d) return "—";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "en", { numeric: "auto" });
  if (Math.abs(s) < 60) return rtf.format(-s, "second");
  if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86400), "day");
}
