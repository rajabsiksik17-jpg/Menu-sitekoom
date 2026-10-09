import type { PublicMenu } from "@/server/menu";
import type { Lang } from "@/lib/i18n";

export type Menu = NonNullable<PublicMenu>;
export type Product = Menu["products"][number];
export type Group = Product["groups"][number];

export type CartLine = {
  key: string;
  productId: number;
  variantId: number | null;
  modifierIds: number[];
  quantity: number;
  note: string;
};

export function money(minor: number, m: Menu["restaurant"]["currency"], lang: Lang) {
  const v = minor / 10 ** m.decimals;
  const text = new Intl.NumberFormat(lang === "ar" ? "ar-JO-u-nu-latn" : "en-US", {
    minimumFractionDigits: m.decimals > 2 ? 2 : m.decimals,
    maximumFractionDigits: m.decimals,
  }).format(v);
  return lang === "ar" ? `${text} ${m.symbol}` : `${m.symbol} ${text}`;
}

/** Price of one unit with the chosen flavor and options (the server recomputes the same value authoritatively). */
export function unitPrice(p: Product, variantId: number | null, modifierIds: number[]) {
  const base = variantId != null ? p.variants.find((v) => v.id === variantId)?.price ?? p.price : p.price;
  let extra = 0;
  for (const g of p.groups) for (const o of g.options) if (modifierIds.includes(o.id)) extra += o.price;
  return base + extra;
}

export function lineKey(productId: number, variantId: number | null, modifierIds: number[], note: string) {
  return `${productId}|${variantId ?? ""}|${[...modifierIds].sort((a, b) => a - b).join(",")}|${note.trim()}`;
}
