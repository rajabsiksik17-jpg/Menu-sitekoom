import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import {
  categories, diningTables, modifierGroups, modifierOptions, productModifierGroups, products, productVariants, promotions, restaurants,
  revokedTableTokens, type Theme,
} from "@/db/schema";
import { mediaUrl } from "@/lib/media";
import { orderingOpen, serviceState } from "./entitlement";

export const DEFAULT_THEME: Theme = { primary: "#0B5CAD", secondary: "#F59E0B", background: "light", buttonStyle: "rounded", cardStyle: "elevated", layout: "grid" };

const shaUrl = (rid: string, sha: string | null, size: "sm" | "lg") => (sha ? `/media/s/${rid}/${sha}?s=${size}` : null);

export type PublicMenu = Awaited<ReturnType<typeof loadPublicMenu>>;
export type TableState = { kind: "none" } | { kind: "ok"; number: number; name: string | null } | { kind: "replaced" } | { kind: "inactive" } | { kind: "unknown" };

export async function findRestaurantBySlug(db: Db, slug: string) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
  return r ?? null;
}

export async function resolveTable(db: Db, restaurantId: string, token: string | null): Promise<TableState & { id?: string; posUid?: string }> {
  if (!token) return { kind: "none" };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { kind: "unknown" };
  const [t] = await db.select().from(diningTables).where(and(eq(diningTables.token, token), eq(diningTables.restaurantId, restaurantId))).limit(1);
  if (t) return t.status === "active" ? { kind: "ok", number: t.number, name: t.name, id: t.id, posUid: t.posUid } : { kind: "inactive" };
  const [old] = await db.select({ tableId: revokedTableTokens.tableId }).from(revokedTableTokens)
    .innerJoin(diningTables, eq(diningTables.id, revokedTableTokens.tableId))
    .where(and(eq(revokedTableTokens.token, token), eq(diningTables.restaurantId, restaurantId))).limit(1);
  return old ? { kind: "replaced" } : { kind: "unknown" };
}

/** Everything the public menu shows, for one restaurant only. No internal configuration (geofence, devices) leaves here. */
export async function loadPublicMenu(db: Db, slug: string, tableToken: string | null, now = new Date()) {
  const r = await findRestaurantBySlug(db, slug);
  if (!r || r.status === "draft") return null;
  const rid = r.id;
  const [cats, prods, vars, groups, opts, links, promos, table] = await Promise.all([
    db.select().from(categories).where(and(eq(categories.restaurantId, rid), eq(categories.isActive, true))).orderBy(asc(categories.sort), asc(categories.nameAr)),
    db.select().from(products).where(and(eq(products.restaurantId, rid), eq(products.isActive, true))).orderBy(asc(products.sort), asc(products.nameAr)),
    db.select().from(productVariants).where(and(eq(productVariants.restaurantId, rid), eq(productVariants.isActive, true))).orderBy(asc(productVariants.sort)),
    db.select().from(modifierGroups).where(and(eq(modifierGroups.restaurantId, rid), eq(modifierGroups.isActive, true))),
    db.select().from(modifierOptions).where(and(eq(modifierOptions.restaurantId, rid), eq(modifierOptions.isActive, true))).orderBy(asc(modifierOptions.sort)),
    db.select().from(productModifierGroups).where(eq(productModifierGroups.restaurantId, rid)).orderBy(asc(productModifierGroups.sort)),
    db.select().from(promotions).where(and(eq(promotions.restaurantId, rid), eq(promotions.isActive, true))).orderBy(asc(promotions.sort)),
    resolveTable(db, rid, tableToken),
  ]);
  const groupById = new Map(groups.map((g) => [g.posId, g]));
  const productList = prods.map((p) => ({
    id: p.posId,
    categoryId: p.categoryPosId,
    nameAr: p.nameAr, nameEn: p.nameEn, descriptionAr: p.descriptionAr, descriptionEn: p.descriptionEn,
    price: p.price,
    image: shaUrl(rid, p.imageSha, "sm"), imageLarge: shaUrl(rid, p.imageSha, "lg"),
    prepMinutes: p.prepMinutes ?? r.defaultPrepMinutes, prepIsDefault: p.prepMinutes == null,
    available: p.isAvailable, featured: p.isFeatured, isNew: p.isNew, labelAr: p.labelAr, labelEn: p.labelEn, popularity: p.popularity,
    variants: vars.filter((v) => v.productPosId === p.posId).map((v) => ({ id: v.posId, name: v.name, price: v.priceOverride ?? p.price, image: shaUrl(rid, v.imageSha, "lg") })),
    groups: links.filter((l) => l.productPosId === p.posId && groupById.has(l.groupPosId)).map((l) => {
      const g = groupById.get(l.groupPosId)!;
      return {
        id: g.posId, name: g.name, min: g.minSelect, max: g.maxSelect,
        options: opts.filter((o) => o.groupPosId === g.posId).map((o) => ({ id: o.posId, name: o.name, price: o.priceDelta, isDefault: o.isDefault })),
      };
    }).filter((g) => g.options.length > 0),
  }));
  const used = new Set(productList.map((p) => p.categoryId));
  const ordering = orderingOpen(r, now);
  return {
    restaurant: {
      slug: r.slug, nameAr: r.nameAr, nameEn: r.nameEn, descriptionAr: r.descriptionAr, descriptionEn: r.descriptionEn,
      logo: mediaUrl(r.logoMediaId, "sm"), cover: mediaUrl(r.coverMediaId, "lg"),
      theme: { ...DEFAULT_THEME, ...r.theme },
      phone: r.showContact ? r.phone : null, whatsapp: r.showContact ? r.whatsapp : null, address: r.showContact ? r.address : null,
      openingHours: r.openingHours ?? [], timezone: r.timezone,
      defaultLang: r.defaultLang, languages: r.languages.length ? r.languages : ["ar"],
      currency: { code: r.currencyCode, symbol: r.currencySymbol, decimals: r.currencyDecimals },
      geoRequired: r.geoEnabled,
      service: serviceState(r, now),
    },
    ordering,
    table: table.kind === "ok" ? { kind: "ok" as const, number: table.number, name: table.name } : { kind: table.kind },
    categories: cats.filter((c) => used.has(c.posId)).map((c) => ({ id: c.posId, nameAr: c.nameAr, nameEn: c.nameEn, icon: c.icon, color: c.color, image: shaUrl(rid, c.imageSha, "sm") })),
    products: productList,
    promotions: promos.filter((p) => !p.archivedAt && (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt > now)).map((p) => ({
      id: p.id, titleAr: p.titleAr, titleEn: p.titleEn, subtitleAr: p.subtitleAr, subtitleEn: p.subtitleEn, ctaAr: p.ctaAr, ctaEn: p.ctaEn,
      ctaTarget: p.ctaTarget, image: mediaUrl(p.imageMediaId, "lg"), mobileImage: mediaUrl(p.mobileImageMediaId ?? p.imageMediaId, "sm"),
    })),
  };
}

export async function productNamesByIds(db: Db, restaurantId: string, ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const rows = await db.select({ id: products.posId, name: products.nameAr }).from(products).where(and(eq(products.restaurantId, restaurantId), inArray(products.posId, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
}
