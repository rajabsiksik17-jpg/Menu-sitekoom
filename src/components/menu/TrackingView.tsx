"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dirOf, pick, translator, type Lang } from "@/lib/i18n";
import type { Tracking } from "@/server/orders";
import { IconCircleCheck, IconCircleX, IconHourglass } from "./icons";

const STEPS = ["sent", "accepted", "preparing", "ready"] as const;
const stepOf = (s: string) => (s === "submitted" || s === "delivered" ? 0 : s === "accepted" ? 1 : s === "preparing" ? 2 : s === "ready" || s === "completed" ? 3 : -1);

/**
 * Live order status. Polls every 4 s (backs off when the tab is hidden or the network fails). The countdown is computed
 * from the server's stored estimated-ready time and the server clock offset, so refreshing never resets it.
 */
export function TrackingView({ token, initial, lang }: { token: string; initial: Tracking; lang: Lang }) {
  const t = useMemo(() => translator(lang), [lang]);
  const [data, setData] = useState(initial);
  const [online, setOnline] = useState(true);
  const offset = useRef(new Date(initial.serverTime).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset.current);
  const lastEta = useRef(initial.order.estimatedReadyAt);
  const [etaChanged, setEtaChanged] = useState(false);
  const o = data.order;
  const final = ["completed", "rejected", "cancelled"].includes(o.status);

  useEffect(() => {
    if (final) return;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const tick = async () => {
      try {
        const res = await fetch(`/api/public/track/${token}`, { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as Tracking;
          offset.current = new Date(next.serverTime).getTime() - Date.now();
          if (lastEta.current && next.order.estimatedReadyAt && next.order.estimatedReadyAt !== lastEta.current) setEtaChanged(true);
          lastEta.current = next.order.estimatedReadyAt;
          setData(next);
          setOnline(true);
          failures = 0;
        } else failures++;
      } catch {
        failures++;
        setOnline(false);
      }
      timer = setTimeout(tick, document.hidden ? 15000 : Math.min(30000, 4000 * 2 ** Math.min(failures, 3)));
    };
    timer = setTimeout(tick, 4000);
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [token, final]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(id);
  }, []);

  // A gentle vibration when the order becomes ready.
  const prev = useRef(o.status);
  useEffect(() => {
    if (prev.current !== "ready" && o.status === "ready") navigator.vibrate?.([200, 100, 200]);
    prev.current = o.status;
  }, [o.status]);

  const eta = o.estimatedReadyAt ? new Date(o.estimatedReadyAt).getTime() : null;
  const remaining = eta ? Math.max(0, eta - now) : null;
  const total = o.acceptedAt && eta ? Math.max(1, eta - new Date(o.acceptedAt).getTime()) : null;
  const progress = total && remaining !== null ? 1 - remaining / total : 0;
  const counting = (o.status === "accepted" || o.status === "preparing") && eta !== null;
  const overdue = counting && remaining === 0;
  const step = stepOf(o.status);
  const cur = data.restaurant.currency;
  const fmt = (minor: number) => {
    const v = new Intl.NumberFormat(lang === "ar" ? "ar-JO-u-nu-latn" : "en-US", { minimumFractionDigits: Math.min(2, cur.decimals), maximumFractionDigits: cur.decimals }).format(minor / 10 ** cur.decimals);
    return lang === "ar" ? `${v} ${cur.symbol}` : `${cur.symbol} ${v}`;
  };
  const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(lang === "ar" ? "ar-JO-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

  const headline = {
    submitted: [t("track.submitted"), t("track.submittedHint")], delivered: [t("track.delivered"), t("track.deliveredHint")],
    accepted: [t("track.accepted"), t("track.acceptedHint")], preparing: [t("track.preparing"), ""], ready: [t("track.ready"), t("track.readyHint")],
    completed: [t("track.completed"), ""], rejected: [t("track.rejected"), o.reason ? t("track.reason", o.reason) : ""],
    cancelled: [t("track.cancelled"), o.reason ? t("track.reason", o.reason) : ""],
  }[o.status] ?? [o.status, ""];

  const mm = remaining !== null ? Math.floor(remaining / 60000) : 0;
  const ss = remaining !== null ? Math.floor((remaining % 60000) / 1000) : 0;
  const ink = (() => { const n = Number.parseInt(data.restaurant.theme.primary.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.62 ? "#111" : "#fff"; })();
  const style = { "--brand": data.restaurant.theme.primary, "--brand-ink": ink } as React.CSSProperties;
  const menuLink = (() => {
    try {
      const rec = (JSON.parse(localStorage.getItem("smenu:orders") ?? "[]") as { token: string; menu: string }[]).find((x) => x.token === token);
      return rec?.menu ?? `/${data.restaurant.slug}`;
    } catch { return `/${data.restaurant.slug}`; }
  });
  const [backHref, setBackHref] = useState(`/${data.restaurant.slug}`);
  useEffect(() => setBackHref(menuLink()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div dir={dirOf(lang)} lang={lang} style={style} className={`bg-${data.restaurant.theme.background} min-h-dvh bg-canvas text-ink`}>
      <div className="mx-auto max-w-lg px-4 pb-12 pt-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {data.restaurant.logo && <img src={data.restaurant.logo} alt="" className="size-12 rounded-xl object-cover" />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{pick(lang, data.restaurant.nameAr, data.restaurant.nameEn)}</div>
            <div className="text-sm text-muted">{t("track.title", o.number)} · {t("track.table", o.table)}</div>
          </div>
          {!final && (
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`} aria-live="polite">
              <span className={`size-1.5 rounded-full ${online ? "animate-pulse bg-emerald-500" : "bg-amber-500"}`} />{online ? t("track.live") : t("track.reconnecting")}
            </span>
          )}
        </div>

        <section className="mt-6 rounded-3xl bg-surface p-6 text-center shadow-sm ring-1 ring-black/5" aria-live="polite">
          {o.status === "ready" ? <IconCircleCheck className="mx-auto size-20 text-emerald-600" strokeWidth={1.5} />
            : o.status === "rejected" || o.status === "cancelled" ? <IconCircleX className="mx-auto size-20 text-red-500" strokeWidth={1.5} />
            : counting ? (
              <div className="relative mx-auto size-44">
                <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-line)" strokeWidth="8" />
                  <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-brand)" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 44} strokeDashoffset={2 * Math.PI * 44 * (1 - Math.min(1, progress))} style={{ transition: "stroke-dashoffset 1s linear" }} />
                </svg>
                <div className="absolute inset-0 grid place-items-center">
                  {overdue ? <IconHourglass className="size-8 text-muted" /> : (
                    <div>
                      <div className="text-4xl font-bold tabular-nums" dir="ltr">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</div>
                      <div className="mt-1 text-xs text-muted">{t("track.remaining")}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : <div className="mx-auto size-16 animate-spin rounded-full border-4 border-line border-t-brand" aria-hidden="true" />}
          <h1 className="mt-5 text-2xl font-bold">{headline[0]}</h1>
          {(overdue ? t("track.stillPreparing") : headline[1]) && <p className="mt-2 text-muted">{overdue ? t("track.stillPreparing") : headline[1]}</p>}
          {counting && !overdue && <p className="mt-2 text-xs text-muted">{t("track.estimateNote")}</p>}
          {etaChanged && counting && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("track.etaUpdated")}</p>}
        </section>

        {step >= 0 && (
          <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="progress">
            {STEPS.map((s, i) => {
              const at = [o.submittedAt, o.acceptedAt, o.preparingAt, o.readyAt][i] ?? null;
              const done = i <= step;
              return (
                <li key={s} className="text-center">
                  <div className={`h-1.5 rounded-full ${done ? "bg-brand" : "bg-line"}`} />
                  <div className={`mt-2 text-xs font-medium ${done ? "text-ink" : "text-muted"}`}>{t(`track.steps.${s}`)}</div>
                  <div className="text-[11px] text-muted tabular-nums">{done ? time(at) : ""}</div>
                </li>
              );
            })}
          </ol>
        )}

        <section className="mt-6 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-semibold">{t("track.items")}</h2>
          <ul className="mt-3 divide-y divide-line">
            {o.items.map((i, k) => (
              <li key={k} className="flex justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium"><span className="tabular-nums">{i.quantity}×</span> {pick(lang, i.nameAr, i.nameEn)}{i.variantName && ` · ${i.variantName}`}</div>
                  {i.modifiers.length > 0 && <div className="text-muted">{i.modifiers.join("، ")}</div>}
                  {i.note && <div className="italic text-muted">“{i.note}”</div>}
                </div>
                <div className="shrink-0 font-medium tabular-nums">{fmt(i.lineTotal)}</div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-line pt-3 font-bold"><span>{translator(lang)("cart.total")}</span><span className="tabular-nums">{fmt(o.total)}</span></div>
          {o.note && <p className="mt-2 text-sm text-muted">“{o.note}”</p>}
        </section>

        <a href={backHref} className="btn-r mt-6 flex h-12 items-center justify-center border border-line bg-surface font-medium">{t("track.backToMenu")}</a>
      </div>
    </div>
  );
}
