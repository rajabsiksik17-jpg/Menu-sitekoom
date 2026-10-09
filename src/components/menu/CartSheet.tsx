"use client";

import { useState } from "react";
import { pick, type Lang, type TextKey } from "@/lib/i18n";
import { money, unitPrice, type CartLine, type Menu } from "./types";
import { unavailableLabel } from "./types";
import { Sheet } from "./Sheet";
import { getFix, type GeoFailure } from "./geo";
import { ClockIcon } from "./ProductSheet";
import { IconMinus, IconPin, IconPlus, IconTrash } from "./icons";

type T = (k: TextKey, ...a: (string | number)[]) => string;
type Phase = { kind: "idle" } | { kind: "locating" } | { kind: "sending" } | { kind: "error"; message: string; retry: boolean };

export function CartSheet(props: {
  menu: Menu; lang: Lang; t: T; lines: CartLine[]; tableToken: string; storageKey: string;
  note: string; setNote: (s: string) => void;
  onQty: (key: string, q: number) => void; onEdit: (line: CartLine) => void; onClose: () => void;
  onSubmitted: (r: { number: number; trackingToken: string; sessionToken: string | null }) => void;
}) {
  const { menu, lang, t, lines } = props;
  const cur = menu.restaurant.currency;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const byId = new Map(menu.products.map((p) => [p.id, p]));
  const priced = lines.map((l) => ({ l, p: byId.get(l.productId)! })).filter((x) => x.p);
  const total = priced.reduce((s, { l, p }) => s + unitPrice(p, l.variantId, l.modifierIds) * l.quantity, 0);
  const maxPrep = Math.max(0, ...priced.map(({ p }) => p.prepMinutes));
  const geoRequired = menu.restaurant.geoRequired;
  const busy = phase.kind === "locating" || phase.kind === "sending";

  // The idempotency key is created once for this cart and kept until the order is accepted by the server,
  // so retrying after a network error can never create a second order.
  const keyStorage = `${props.storageKey}:idem`;
  const idempotencyKey = () => {
    try {
      const k = sessionStorage.getItem(keyStorage);
      if (k) return k;
      const n = crypto.randomUUID().replaceAll("-", "");
      sessionStorage.setItem(keyStorage, n);
      return n;
    } catch {
      return crypto.randomUUID().replaceAll("-", "");
    }
  };

  async function submit() {
    if (busy || priced.length === 0) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return setPhase({ kind: "error", message: t("cart.offline"), retry: true });
    let location: { lat: number; lng: number; accuracy: number; capturedAt: number } | null = null;
    if (geoRequired) {
      setPhase({ kind: "locating" });
      try {
        location = await getFix();
      } catch (e) {
        const f = e as GeoFailure;
        return setPhase({ kind: "error", message: t(f === "denied" ? "geo.denied" : f === "timeout" ? "geo.timeout" : f === "unsupported" ? "geo.unsupported" : "geo.unavailable"), retry: f !== "unsupported" });
      }
    }
    setPhase({ kind: "sending" });
    try {
      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: menu.restaurant.slug, tableToken: props.tableToken, idempotencyKey: idempotencyKey(), lang, note: props.note.trim() || null, location,
          items: priced.map(({ l }) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, modifierIds: l.modifierIds, note: l.note || null })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.trackingToken) {
        try {
          sessionStorage.removeItem(keyStorage);
          const recent = JSON.parse(localStorage.getItem("smenu:orders") ?? "[]") as { token: string; number: number; slug: string; at: number; menu: string }[];
          recent.unshift({ token: data.trackingToken, number: data.number, slug: menu.restaurant.slug, at: Date.now(), menu: window.location.pathname });
          localStorage.setItem("smenu:orders", JSON.stringify(recent.slice(0, 10)));
        } catch { /* storage unavailable: tracking still works through the link */ }
        // The order is stored on the server; the "My order" sheet follows it from here (no page change).
        props.onSubmitted({ number: data.number, trackingToken: data.trackingToken, sessionToken: data.sessionToken ?? null });
        return;
      }
      setPhase({ kind: "error", message: explain(data, res.status, location?.accuracy ?? null), retry: res.status >= 500 || res.status === 429 || String(data.error ?? "").startsWith("location_") });
    } catch {
      setPhase({ kind: "error", message: t("cart.failed") + " " + t("cart.offline"), retry: true });
    }
  }

  function explain(data: { error?: string; name?: string; group?: string; distanceM?: number; index?: number }, status: number, accuracy: number | null): string {
    const code = data.error ?? "";
    const itemName = data.index != null && priced[data.index] ? pick(lang, priced[data.index]!.p.nameAr, priced[data.index]!.p.nameEn) : data.name ?? "";
    switch (code) {
      case "location_outside": return t("geo.outside", data.distanceM ?? "?");
      case "location_inaccurate": return t("geo.inaccurate", accuracy != null ? Math.round(accuracy) : "?");
      case "location_stale": return t("geo.stale");
      case "location_invalid": return t("geo.unavailable");
      case "product_unavailable": return t("err.product_unavailable", itemName);
      case "modifier_count": return t("err.modifier_count", data.group ?? itemName);
      case "product_not_found": case "modifier_invalid": case "variant_required": case "variant_invalid": case "rate_limited":
      case "table_qr_replaced": case "table_unavailable": return t(`err.${code}` as TextKey, itemName);
      case "ordering_paused": case "ordering_closed": case "ordering_expired": case "ordering_suspended": case "ordering_draft":
        return t(`menu.ordering.${code.slice(9)}` as TextKey);
      default: return status >= 500 ? t("err.server") : t("cart.failed");
    }
  }

  return (
    <Sheet onClose={props.onClose} label={t("cart.title")} closeLabel={t("product.close")} wide>
      <div className="flex max-h-[92dvh] flex-col">
        <div className="border-b border-line px-5 pb-4 pt-6">
          <h2 className="text-xl font-bold">{t("cart.title")}</h2>
          {menu.table.kind === "ok" && <p className="mt-1 text-sm text-muted">{t("menu.table", menu.table.name ?? menu.table.number)}</p>}
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          {priced.length === 0 && <p className="py-10 text-center text-muted">{t("cart.empty")}</p>}
          <ul className="divide-y divide-line">
            {priced.map(({ l, p }) => {
              const v = p.variants.find((x) => x.id === l.variantId);
              const opts = p.groups.flatMap((g) => g.options).filter((o) => l.modifierIds.includes(o.id));
              const u = unitPrice(p, l.variantId, l.modifierIds);
              return (
                <li key={l.key} className="flex gap-3 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{pick(lang, p.nameAr, p.nameEn)}{v && <span className="font-normal text-muted"> · {v.name}</span>}</div>
                    {opts.length > 0 && <div className="mt-0.5 text-sm text-muted">{opts.map((o) => o.name).join("، ")}</div>}
                    {l.note && <div className="mt-0.5 text-sm italic text-muted">“{l.note}”</div>}
                    {!p.available && <div className="mt-1 text-sm text-red-600">{unavailableLabel(p, menu, lang)}</div>}
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center rounded-full border border-line">
                        <button type="button" disabled={busy} onClick={() => props.onQty(l.key, l.quantity - 1)} className="grid size-10 place-items-center text-brand" aria-label={l.quantity === 1 ? t("cart.remove") : "-"}>{l.quantity === 1 ? <IconTrash className="size-[18px]" /> : <IconMinus className="size-[18px]" />}</button>
                        <span className="w-7 text-center font-semibold tabular-nums">{l.quantity}</span>
                        <button type="button" disabled={busy} onClick={() => props.onQty(l.key, Math.min(50, l.quantity + 1))} className="grid size-10 place-items-center text-brand" aria-label="+"><IconPlus className="size-[18px]" /></button>
                      </div>
                      <button type="button" disabled={busy} onClick={() => props.onEdit(l)} className="text-sm font-medium text-brand underline-offset-4 hover:underline">{t("cart.edit")}</button>
                    </div>
                  </div>
                  <div className="shrink-0 text-end font-semibold tabular-nums">{money(u * l.quantity, cur, lang)}</div>
                </li>
              );
            })}
          </ul>
          {priced.length > 0 && (
            <label className="mt-2 block">
              <span className="mb-1.5 block text-sm font-semibold">{t("cart.orderNote")}</span>
              <textarea value={props.note} onChange={(e) => props.setNote(e.target.value.slice(0, 500))} rows={2} maxLength={500} disabled={busy}
                className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-brand" />
            </label>
          )}
          {geoRequired && priced.length > 0 && (
            <div className="mt-4 rounded-2xl bg-brand/5 p-4 text-sm leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-brand"><IconPin className="size-4" />{t("geo.title")}</div>
              <div className="mt-1 text-muted">{t("geo.explain")}</div>
            </div>
          )}
        </div>
        {priced.length > 0 && (
          <div className="pb-safe border-t border-line bg-surface px-5 pt-4">
            <div className="flex items-center justify-between text-lg font-bold">
              <span>{t("cart.total")}</span><span className="tabular-nums">{money(total, cur, lang)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{t("cart.chargesNote")} {t("cart.payNote")}</p>
            {maxPrep > 0 && <p className="mt-1 flex items-center gap-1 text-xs text-muted"><ClockIcon /> {t("cart.prepEstimate", maxPrep)}</p>}
            {phase.kind === "error" && (
              <div role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {phase.message}
                {phase.retry && <div className="mt-1 text-xs text-red-600/80">{t("cart.retrySafe")}</div>}
              </div>
            )}
            <button type="button" onClick={submit} disabled={busy || priced.some(({ p }) => !p.available)}
              className="btn-r my-3 flex h-14 w-full items-center justify-center gap-3 bg-brand text-lg font-semibold text-brand-ink shadow-sm transition disabled:opacity-60">
              {busy && <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
              {phase.kind === "locating" ? t("geo.checking") : phase.kind === "sending" ? t("cart.submitting")
                : phase.kind === "error" && phase.retry ? t("cart.retry") : geoRequired ? t("geo.allow") : t("cart.submit")}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
