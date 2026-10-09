"use client";

import { useEffect, useRef, useState } from "react";
import { pick, type Lang, type TextKey } from "@/lib/i18n";
import type { PublicSession } from "@/server/sessions";
import type { OrderInvoice } from "@/db/schema";
import { Sheet } from "./Sheet";
import { IconBell, IconHourglass, IconPrinter, IconReceipt, IconUtensils } from "./icons";

type T = (k: TextKey, ...a: (string | number)[]) => string;
type Order = PublicSession["orders"][number];
export type SessionTab = "orders" | "invoice";

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-700", delivered: "bg-sky-100 text-sky-800", accepted: "bg-indigo-100 text-indigo-800",
  preparing: "bg-amber-100 text-amber-900", ready: "bg-emerald-100 text-emerald-800", completed: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-100 text-red-700", cancelled: "bg-red-50 text-red-700",
};

/**
 * "My order": the table session on the customer's phone — every order of the session with its live status and countdown,
 * and the table invoice (only when it is current, see invoice.state) with the request button. Everything shown comes from
 * the server; nothing is reported as done before the server confirms it.
 */
export function SessionSheet(props: {
  data: PublicSession | null; token: string | null; ended: boolean; online: boolean; lang: Lang; t: T; tab: SessionTab;
  onTab: (t: SessionTab) => void; onClose: () => void; onChanged: () => void;
}) {
  const { data, lang, t } = props;
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (data) offset.current = new Date(data.serverTime).getTime() - Date.now(); }, [data]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now() + offset.current), 1000); return () => clearInterval(id); }, []);

  const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString(lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
  const cur = data?.restaurant.currency ?? { symbol: "", decimals: 3 };
  const money = (minor: number) => {
    const v = new Intl.NumberFormat(lang === "ar" ? "ar-JO-u-nu-latn" : "en-US", { minimumFractionDigits: Math.min(2, cur.decimals), maximumFractionDigits: cur.decimals }).format(minor / 10 ** cur.decimals);
    return lang === "ar" ? `${v} ${cur.symbol}` : `${cur.symbol} ${v}`;
  };
  const invoiceBadge = data?.invoice.state === "ready" ? data.invoice.count : null;

  return (
    <Sheet onClose={props.onClose} label={t("session.title")} closeLabel={t("product.close")} wide>
      <div className="flex max-h-[92dvh] flex-col">
        <div className="border-b border-line px-5 pb-3 pt-6">
          <div className="flex items-center gap-3 pe-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {data?.restaurant.logo && <img src={data.restaurant.logo} alt="" className="size-11 rounded-xl object-cover ring-1 ring-black/5" />}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold">{data ? pick(lang, data.restaurant.nameAr, data.restaurant.nameEn) : t("session.title")}</h2>
              {data && <p className="text-sm text-muted">{t("menu.table", data.table.name ?? data.table.number)}</p>}
            </div>
            {data && data.status === "open" && (
              <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${props.online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`} aria-live="polite">
                <span className={`size-1.5 rounded-full ${props.online ? "animate-pulse bg-emerald-500" : "bg-amber-500"}`} />{props.online ? t("track.live") : t("track.reconnecting")}
              </span>
            )}
          </div>
          {data?.status === "closed" && (
            <div role="status" className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="font-semibold">{t("session.closed")}</div>
              {data.visibleUntil && <div className="mt-0.5 text-emerald-800/80">{t("session.closedHint", time(data.visibleUntil))}</div>}
            </div>
          )}
          {data && (
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1" role="tablist">
              {(["orders", "invoice"] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={props.tab === k} onClick={() => props.onTab(k)}
                  className={`flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${props.tab === k ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>
                  {k === "orders" ? t("session.tabOrders") : t("session.tabInvoice")}
                  {k === "orders" && <span className="rounded-full bg-line px-1.5 text-xs tabular-nums">{data.orders.length}</span>}
                  {k === "invoice" && invoiceBadge != null && <span className="size-2 rounded-full bg-brand" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {props.ended ? (
            <Empty icon={<IconUtensils className="size-10" strokeWidth={1.5} />} title={t("session.ended")} hint={t("session.endedHint")} />
          ) : !data ? (
            <div className="space-y-3" aria-busy="true" aria-label={t("session.loading")}>
              {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-line/70" />)}
              {!props.online && <p className="text-center text-sm text-muted">{t("session.loadFailed")}</p>}
            </div>
          ) : props.tab === "orders" ? (
            data.orders.length === 0 ? <Empty icon={<IconReceipt className="size-10" strokeWidth={1.5} />} title={t("session.empty")} /> : (
              <ul className="space-y-3">
                {data.orders.map((o) => <OrderCard key={o.number} o={o} closed={data.status === "closed"} now={now} lang={lang} t={t} money={money} time={time} />)}
              </ul>
            )
          ) : (
            <InvoicePanel data={data} token={props.token} lang={lang} t={t} money={money} time={time} onChanged={props.onChanged} />
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <div className="flex justify-center text-muted">{icon}</div>
      <p className="mt-3 font-semibold">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

function OrderCard({ o, closed, now, lang, t, money, time }: {
  o: Order; closed: boolean; now: number; lang: Lang; t: T; money: (m: number) => string; time: (i: string | null) => string;
}) {
  const eta = o.estimatedReadyAt ? new Date(o.estimatedReadyAt).getTime() : null;
  const counting = !closed && (o.status === "accepted" || o.status === "preparing") && eta !== null;
  const remaining = counting ? Math.max(0, eta! - now) : 0;
  const total = counting && o.acceptedAt ? Math.max(1, eta! - new Date(o.acceptedAt).getTime()) : 1;
  const mm = Math.floor(remaining / 60000), ss = Math.floor((remaining % 60000) / 1000);
  return (
    <li className="overflow-hidden rounded-2xl bg-surface ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="font-bold">{t("session.order", o.number)}</div>
          <div className="mt-0.5 text-xs text-muted">{t("session.placedAt", time(o.submittedAt))}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[o.status] ?? "bg-line"}`}>{t(`status.${o.status}` as TextKey)}</span>
      </div>
      {counting && (
        <div className="px-4 pb-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">{t("track.remaining")}</span>
            <span className="text-lg font-bold tabular-nums" dir="ltr">{remaining === 0 ? <IconHourglass className="size-5 text-muted" /> : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (1 - remaining / total) * 100)}%` }} />
          </div>
        </div>
      )}
      {o.status === "ready" && <div className="mx-4 mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"><span className="flex items-center gap-2"><IconBell className="size-4" />{t("track.readyHint")}</span></div>}
      {(o.status === "rejected" || o.status === "cancelled") && o.reason && <div className="mx-4 mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{t("track.reason", o.reason)}</div>}
      <ul className="divide-y divide-line border-t border-line px-4 text-sm">
        {o.items.map((i, k) => (
          <li key={k} className="flex justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <span className="font-medium"><span className="tabular-nums">{i.quantity}×</span> {pick(lang, i.nameAr, i.nameEn)}{i.variantName && ` · ${i.variantName}`}</span>
              {i.modifiers.length > 0 && <div className="text-muted">{i.modifiers.join("، ")}</div>}
              {i.note && <div className="italic text-muted">“{i.note}”</div>}
            </div>
            <span className="shrink-0 tabular-nums">{money(i.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
        <a href={`/o/${o.trackingToken}`} className="font-medium text-brand underline-offset-4 hover:underline">{t("session.track")}</a>
        <span className="font-bold tabular-nums">{money(o.invoice?.total ?? o.total)}</span>
      </div>
    </li>
  );
}

function InvoicePanel({ data, token, lang, t, money, time, onChanged }: {
  data: PublicSession; token: string | null; lang: Lang; t: T; money: (m: number) => string; time: (i: string | null) => string; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = data.invoice.state;
  if (state !== "ready") {
    const msg = state === "updating" ? t("invoice.updating") : state === "waiting" ? t("invoice.waiting") : t("invoice.none");
    return <Empty icon={state === "updating" ? <IconHourglass className="size-10" strokeWidth={1.5} /> : <IconReceipt className="size-10" strokeWidth={1.5} />} title={msg} />;
  }
  const invoices = data.orders.filter((o) => o.invoice && o.status !== "rejected" && o.status !== "cancelled").map((o) => ({ order: o.number, inv: o.invoice as OrderInvoice }))
    .sort((a, b) => a.order - b.order);
  const req = data.request;
  const active = req && ["pending", "delivered", "acknowledged"].includes(req.status);
  const paidState = data.invoice.paid >= data.invoice.total ? "paid" : data.invoice.paid > 0 ? "partial" : "unpaid";

  async function request() {
    if (busy || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/session/${encodeURIComponent(token)}/invoice-request`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(t(`err.${body.error ?? "server"}` as TextKey));
      onChanged();
    } catch {
      setError(t("cart.offline"));
    } finally {
      setBusy(false);
    }
  }
  const print = () => {
    document.documentElement.classList.add("print-invoice");
    const done = () => { document.documentElement.classList.remove("print-invoice"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  };

  return (
    <div>
      <div className="print-area rounded-2xl bg-surface p-4 ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-3 border-b border-dashed border-line pb-3">
          <div>
            <div className="text-lg font-bold">{t("invoice.title")}</div>
            <div className="text-sm text-muted">{pick(lang, data.restaurant.nameAr, data.restaurant.nameEn)} · {t("menu.table", data.table.name ?? data.table.number)}</div>
            {data.restaurant.address && <div className="text-xs text-muted">{data.restaurant.address}</div>}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${paidState === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{t(`invoice.${paidState}` as TextKey)}</span>
        </div>
        {invoices.map(({ order, inv }) => (
          <section key={inv.saleId} className="border-b border-dashed border-line py-3 last:border-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-semibold">{t("invoice.saleNo", inv.number)}</span>
              <span className="text-xs text-muted">{t("invoice.forOrder", order)} · {new Date(inv.issuedAt).toLocaleString(lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {inv.lines.map((l, k) => (
                <li key={k} className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <span><span className="tabular-nums">{l.quantity}×</span> {l.name}</span>
                    {l.options.length > 0 && <div className="text-xs text-muted">{l.options.join("، ")}</div>}
                    {l.discount > 0 && <div className="text-xs text-emerald-700">−{money(l.discount)}</div>}
                  </div>
                  <span className="shrink-0 tabular-nums">{money(l.total)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 space-y-0.5 text-xs text-muted">
              {inv.discount > 0 && <Row k={t("invoice.discount")} v={"−" + money(inv.discount)} />}
              {inv.tax > 0 && <Row k={t("invoice.tax")} v={money(inv.tax)} />}
              <Row k={t("invoice.total")} v={money(inv.total)} strong />
              {inv.paymentMethod && <div>{t("invoice.method", inv.paymentMethod)}</div>}
              {inv.cashier && <div>{t("invoice.cashier", inv.cashier)}</div>}
              {inv.taxNumber && <div>{t("invoice.taxNumber", inv.taxNumber)}</div>}
            </dl>
          </section>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-line pt-3 text-lg font-bold">
          <span>{t("invoice.grandTotal")}</span><span className="tabular-nums">{money(data.invoice.total)}</span>
        </div>
        <p className="mt-2 text-xs text-muted">{data.status === "closed" ? t("invoice.closedNote") : t("invoice.authoritative")}</p>
      </div>

      {req && (
        <div role="status" className={`mt-4 rounded-2xl px-4 py-3 text-sm ${req.status === "printed" ? "bg-emerald-50 text-emerald-900" : req.status === "dismissed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
          {t(`invoice.req.${req.status}` as TextKey)} <span className="text-xs opacity-70">· {time(req.handledAt ?? req.requestedAt)}</span>
        </div>
      )}
      {error && <div role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="pb-safe mt-4 grid gap-2 sm:grid-cols-2">
        {data.status === "open" && !active && (
          <button type="button" onClick={request} disabled={busy}
            className="btn-r flex h-12 items-center justify-center gap-2 bg-brand font-semibold text-brand-ink shadow-sm transition disabled:opacity-60">
            {busy && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
            {busy ? t("invoice.requesting") : req ? t("invoice.requestAgain") : t("invoice.request")}
          </button>
        )}
        <button type="button" onClick={print} className="btn-r flex h-12 items-center justify-center border border-line bg-surface font-medium gap-2"><IconPrinter className="size-4" />{t("invoice.print")}</button>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "text-sm font-semibold text-ink" : ""}`}><dt>{k}</dt><dd className="tabular-nums">{v}</dd></div>;
}
