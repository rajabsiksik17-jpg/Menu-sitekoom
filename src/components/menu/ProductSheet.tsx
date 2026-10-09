"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pick, type Lang, type TextKey } from "@/lib/i18n";
import { money, unitPrice, type Menu, type Product } from "./types";
import { unavailableLabel } from "./types";
import { Sheet } from "./Sheet";
import { IconMinus, IconPlus } from "./icons";

type T = (k: TextKey, ...a: (string | number)[]) => string;

export function ProductSheet(props: {
  menu: Menu; product: Product; lang: Lang; t: T; canOrder: boolean;
  initial?: { variantId: number | null; modifierIds: number[]; quantity: number; note: string };
  onClose: () => void;
  onAdd: (sel: { variantId: number | null; modifierIds: number[]; quantity: number; note: string }) => void;
}) {
  const { product: p, lang, t, menu } = props;
  const cur = menu.restaurant.currency;
  const [variantId, setVariantId] = useState<number | null>(props.initial?.variantId ?? p.variants[0]?.id ?? null);
  const [mods, setMods] = useState<number[]>(
    props.initial?.modifierIds ?? p.groups.flatMap((g) => g.options.filter((o) => o.isDefault).slice(0, g.max).map((o) => o.id)),
  );
  const [qty, setQty] = useState(props.initial?.quantity ?? 1);
  const [note, setNote] = useState(props.initial?.note ?? "");
  const [showMissing, setShowMissing] = useState(false);
  const firstMissingRef = useRef<HTMLFieldSetElement | null>(null);

  const missing = useMemo(
    () => p.groups.filter((g) => {
      const n = g.options.filter((o) => mods.includes(o.id)).length;
      return n < g.min || n > g.max;
    }),
    [p.groups, mods],
  );
  const price = unitPrice(p, variantId, mods);
  const image = (variantId != null && p.variants.find((v) => v.id === variantId)?.image) || p.imageLarge;

  useEffect(() => {
    if (showMissing) firstMissingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [showMissing]);

  const toggle = (g: Product["groups"][number], id: number) => {
    setMods((m) => {
      const inGroup = g.options.map((o) => o.id);
      if (g.max === 1) return [...m.filter((x) => !inGroup.includes(x)), ...(m.includes(id) && g.min === 0 ? [] : [id])];
      if (m.includes(id)) return m.filter((x) => x !== id);
      if (m.filter((x) => inGroup.includes(x)).length >= g.max) return m;
      return [...m, id];
    });
  };

  // Same five rules as the POS editor: one · one or none · up to N · exactly N · from N to M.
  const rule = (g: Product["groups"][number]) =>
    g.max === 1 ? (g.min >= 1 ? t("product.chooseOne") : t("product.chooseOneOptional"))
      : g.min === 0 ? t("product.chooseUpTo", g.max)
      : g.min === g.max ? t("product.chooseExactly", g.min)
      : t("product.chooseBetween", g.min, g.max);

  const submit = () => {
    if (missing.length) {
      setShowMissing(true);
      return;
    }
    props.onAdd({ variantId, modifierIds: mods, quantity: qty, note: note.trim() });
  };

  const name = pick(lang, p.nameAr, p.nameEn);
  const description = pick(lang, p.descriptionAr, p.descriptionEn);

  return (
    <Sheet onClose={props.onClose} label={name} closeLabel={t("product.close")}>
      <div className="flex max-h-[92dvh] flex-col">
        <div className="overflow-y-auto overscroll-contain">
          {image ? (
            <div className="relative aspect-[4/3] w-full bg-line sm:aspect-[16/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={name} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-6" />
          )}
          <div className="space-y-5 px-5 pb-6 pt-5">
            <div>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold leading-snug">{name}</h2>
                <div className="shrink-0 text-lg font-bold text-brand">{money(price, cur, lang)}</div>
              </div>
              {description && <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>}
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1 text-ink" title={t("menu.prepEstimate")}>
                  <ClockIcon /> {t("menu.prep", p.prepMinutes)}
                </span>
                {!p.available && <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">{unavailableLabel(p, menu, lang)}</span>}
              </div>
            </div>

            {p.variants.length > 0 && (
              <fieldset>
                <legend className="mb-2 flex w-full items-center justify-between font-semibold">
                  <span>{t("product.flavor")}</span>
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">{t("product.required")}</span>
                </legend>
                <div className="grid gap-2">
                  {p.variants.map((v) => (
                    <label key={v.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${variantId === v.id ? "border-brand bg-brand/5" : "border-line"}`}>
                      <span className="flex items-center gap-3">
                        <input type="radio" name="variant" className="size-5 accent-[var(--color-brand)]" checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
                        <span>{v.name}</span>
                      </span>
                      <span className="text-sm text-muted">{money(v.price, cur, lang)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {p.groups.map((g) => {
              const bad = showMissing && missing.includes(g);
              return (
                <fieldset key={g.id} ref={bad && missing[0] === g ? firstMissingRef : undefined}
                  className={`rounded-2xl ${bad ? "outline outline-2 outline-offset-4 outline-red-500" : ""}`}>
                  <legend className="mb-2 flex w-full items-center justify-between gap-2 font-semibold">
                    <span>{g.name} <span className="text-sm font-normal text-muted">· {rule(g)}</span></span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${g.min > 0 ? "bg-brand/10 text-brand" : "bg-canvas text-muted"}`}>
                      {g.min > 0 ? t("product.required") : t("product.optional")}
                    </span>
                  </legend>
                  <div className="grid gap-2">
                    {g.options.map((o) => {
                      const on = mods.includes(o.id);
                      return (
                        <label key={o.id} className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-2.5 transition ${on ? "border-brand bg-brand/5" : "border-line"}`}>
                          <span className="flex items-center gap-3">
                            <input type={g.max === 1 ? "radio" : "checkbox"} name={`g${g.id}`} className="size-5 accent-[var(--color-brand)]" checked={on} onChange={() => toggle(g, o.id)} />
                            <span>{o.name}</span>
                          </span>
                          {o.price !== 0 && <span className="text-sm text-muted">{o.price > 0 ? "+" : ""}{money(o.price, cur, lang)}</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

            {props.canOrder && (
              <label className="block">
                <span className="mb-2 block font-semibold">{t("product.note")}</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} rows={2} maxLength={200}
                  placeholder={t("product.notePlaceholder")} className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-brand" />
              </label>
            )}
            {showMissing && missing.length > 0 && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t("product.missing", missing.map((g) => g.name).join("، "))}</p>
            )}
          </div>
        </div>

        {props.canOrder && p.available && (
          <div className="pb-safe border-t border-line bg-surface px-4 pt-3">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex items-center rounded-full border border-line">
                <button type="button" aria-label="-" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid size-12 place-items-center text-brand disabled:opacity-30" disabled={qty <= 1}><IconMinus /></button>
                <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">{qty}</span>
                <button type="button" aria-label="+" onClick={() => setQty((q) => Math.min(50, q + 1))} className="grid size-12 place-items-center text-brand"><IconPlus /></button>
              </div>
              <button type="button" onClick={submit} className="btn-r flex h-12 flex-1 items-center justify-between gap-2 bg-brand px-5 font-semibold text-brand-ink shadow-sm active:scale-[.99]">
                <span>{props.initial ? t("product.update") : t("product.add")}</span>
                <span className="tabular-nums">{money(price * qty, cur, lang)}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}
