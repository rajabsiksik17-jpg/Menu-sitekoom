"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dirOf, pick, translator, type Lang } from "@/lib/i18n";
import { lineKey, money, unitPrice, type CartLine, type Menu, type Product } from "./types";
import { ProductSheet, ClockIcon } from "./ProductSheet";
import { CartSheet } from "./CartSheet";
import { SessionSheet, type SessionTab } from "./SessionSheet";
import { useTableSession } from "./useTableSession";
import { IconChat, IconClock, IconPhone, IconPin, IconPlus, IconReceipt, IconSearch, IconStar, IconTable, IconX } from "./icons";

type Sort = "default" | "priceAsc" | "priceDesc" | "popular";

/** Arabic-aware search key: no diacritics/tatweel, unified alef/ya/ta marbuta, lower case. */
function norm(s: string | null | undefined) {
  return (s ?? "").normalize("NFKD").replace(/[ً-ٰٟـ]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .toLowerCase().trim();
}

function inkFor(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#111111" : "#ffffff";
}

export function MenuApp({ menu, lang, tableToken }: { menu: Menu; lang: Lang; tableToken: string | null }) {
  const t = useMemo(() => translator(lang), [lang]);
  const router = useRouter();
  const r = menu.restaurant;
  const cur = r.currency;
  const canOrder = menu.table.kind === "ok" && menu.ordering.open && !!tableToken;
  const storageKey = `smenu:${r.slug}:${tableToken ?? "browse"}`;

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("default");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [activeCat, setActiveCat] = useState<number | null>(menu.categories[0]?.id ?? null);
  const [open, setOpen] = useState<{ product: Product; edit?: CartLine } | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const [bump, setBump] = useState(0);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionTab, setSessionTab] = useState<SessionTab>("orders");
  const loaded = useRef(false);
  const session = useTableSession(r.slug, tableToken);
  const hasSession = !!session.token || !!session.data;

  // While the sheet is open every change counts as seen; a new change while it is closed lights the badge.
  useEffect(() => { if (sessionOpen && session.data) session.markSeen(); }, [sessionOpen, session.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // A short vibration when an order of the table becomes ready (once per order).
  const readySeen = useRef<Set<number> | null>(null);
  useEffect(() => {
    const orders = session.data?.orders;
    if (!orders) return;
    const ready = new Set(orders.filter((o) => o.status === "ready").map((o) => o.number));
    if (readySeen.current && [...ready].some((n) => !readySeen.current!.has(n))) navigator.vibrate?.([200, 100, 200]);
    readySeen.current = ready;
  }, [session.data]);

  const openSession = (tab: SessionTab = "orders") => { setSessionTab(tab); setSessionOpen(true); };

  // Cart survives a refresh / phone lock (per restaurant and table), never shared between tables.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${storageKey}:cart`) ?? "null") as { lines: CartLine[]; note: string; at: number } | null;
      const ids = new Set(menu.products.map((p) => p.id));
      if (saved && Date.now() - saved.at < 6 * 3600_000) {
        setLines(saved.lines.filter((l) => ids.has(l.productId)));
        setNote(saved.note ?? "");
      }
    } catch { /* private mode */ }
    loaded.current = true;
  }, [storageKey, menu.products]);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(`${storageKey}:cart`, JSON.stringify({ lines, note, at: Date.now() })); } catch { /* ignore */ }
  }, [lines, note, storageKey]);

  const byCategory = useMemo(() => {
    const m = new Map<number | null, Product[]>();
    for (const p of menu.products) m.set(p.categoryId, [...(m.get(p.categoryId) ?? []), p]);
    return m;
  }, [menu.products]);

  const sorted = useCallback((list: Product[]) => {
    let l = onlyAvailable ? list.filter((p) => p.available) : list;
    if (sort === "priceAsc") l = [...l].sort((a, b) => a.price - b.price);
    if (sort === "priceDesc") l = [...l].sort((a, b) => b.price - a.price);
    if (sort === "popular") l = [...l].sort((a, b) => b.popularity - a.popularity || Number(b.featured) - Number(a.featured));
    return l;
  }, [onlyAvailable, sort]);

  const q = norm(query);
  const results = useMemo(() => {
    if (!q) return null;
    const cats = new Map(menu.categories.map((c) => [c.id, norm(c.nameAr) + " " + norm(c.nameEn)]));
    return sorted(menu.products.filter((p) => [p.nameAr, p.nameEn, p.descriptionAr, p.descriptionEn, p.labelAr, p.labelEn].some((s) => norm(s).includes(q))
      || (p.categoryId != null && cats.get(p.categoryId)?.includes(q))));
  }, [q, menu.products, menu.categories, sorted]);
  const featured = useMemo(() => menu.products.filter((p) => p.featured && p.available), [menu.products]);

  // Scroll-spy: the category chip follows the section on screen.
  const sectionRefs = useRef(new Map<number, HTMLElement>());
  const chipsRef = useRef<HTMLDivElement>(null);
  const spyPaused = useRef(false);
  useEffect(() => {
    if (results) return;
    const obs = new IntersectionObserver((entries) => {
      if (spyPaused.current) return;
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveCat(Number((visible.target as HTMLElement).dataset.cat));
    }, { rootMargin: "-140px 0px -60% 0px" });
    sectionRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [results, menu.categories]);
  useEffect(() => {
    chipsRef.current?.querySelector(`[data-chip="${activeCat}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCat]);

  const goCategory = (id: number) => {
    setQuery("");
    setActiveCat(id);
    spyPaused.current = true;
    requestAnimationFrame(() => {
      const el = sectionRefs.current.get(id);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 128, behavior: "smooth" });
      setTimeout(() => (spyPaused.current = false), 700);
    });
  };

  const add = (p: Product, sel: { variantId: number | null; modifierIds: number[]; quantity: number; note: string }, replaceKey?: string) => {
    const key = lineKey(p.id, sel.variantId, sel.modifierIds, sel.note);
    setLines((ls) => {
      const rest = replaceKey ? ls.filter((l) => l.key !== replaceKey) : ls;
      const same = rest.find((l) => l.key === key);
      if (same) return rest.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, (replaceKey ? 0 : l.quantity) + sel.quantity) } : l));
      return [...rest, { key, productId: p.id, ...sel }];
    });
    setBump((b) => b + 1);
  };

  const quickAdd = (p: Product) => {
    if (p.variants.length || p.groups.some((g) => g.min > 0) || p.groups.length) return setOpen({ product: p });
    add(p, { variantId: null, modifierIds: [], quantity: 1, note: "" });
  };

  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const total = lines.reduce((s, l) => {
    const p = menu.products.find((x) => x.id === l.productId);
    return p ? s + unitPrice(p, l.variantId, l.modifierIds) * l.quantity : s;
  }, 0);

  const switchLang = () => {
    const next = lang === "ar" ? "en" : "ar";
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  const style = { "--brand": r.theme.primary, "--brand-ink": inkFor(r.theme.primary), "--accent": r.theme.secondary } as React.CSSProperties;
  const notice = menu.table.kind === "replaced" ? t("menu.tableReplaced")
    : menu.table.kind === "inactive" ? t("menu.tableInactive")
    : menu.table.kind === "unknown" ? t("menu.tableUnknown")
    : menu.table.kind === "none" ? t("menu.browseOnly")
    : !menu.ordering.open ? t(`menu.ordering.${menu.ordering.reason}` as Parameters<typeof t>[0]) : null;
  const name = pick(lang, r.nameAr, r.nameEn);
  const todayHours = useMemo(() => {
    try {
      const wd = new Intl.DateTimeFormat("en-US", { timeZone: r.timezone, weekday: "short" }).format(new Date());
      const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
      const slots = r.openingHours.filter((h) => h.day === day).map((h) => `${h.open}–${h.close}`);
      return slots.length ? slots.join("، ") : null;
    } catch { return null; }
  }, [r.openingHours, r.timezone]);
  const sortLabel: Record<Sort, string> = { default: t("menu.sort.default"), priceAsc: t("menu.sort.priceAsc"), priceDesc: t("menu.sort.priceDesc"), popular: t("menu.sort.popular") };

  return (
    <div dir={dirOf(lang)} lang={lang} style={style} className={`bg-${r.theme.background} radius-${r.theme.buttonStyle} min-h-dvh bg-canvas pb-28 text-ink`}>
      {/* Header */}
      <header className="relative">
        <div className="relative h-44 w-full overflow-hidden bg-brand sm:h-56">
          {r.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.cover} alt="" className="h-full w-full object-cover" fetchPriority="high" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
            {menu.table.kind === "ok" ? (
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold text-gray-900 shadow"><span className="flex items-center gap-1.5"><IconTable className="size-4" />{t("menu.table", menu.table.name ?? menu.table.number)}</span></span>
            ) : <span />}
            <div className="flex items-center gap-2">
              {hasSession && <MyOrderButton label={t("session.myOrder")} unread={session.unread} unreadLabel={t("session.unread")} onClick={() => openSession()} variant="hero" />}
              {r.languages.length > 1 && (
                <button type="button" onClick={switchLang} className="rounded-full bg-black/40 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-black/55">{t("menu.language")}</button>
              )}
            </div>
          </div>
        </div>
        <div className="mx-auto -mt-12 max-w-5xl px-4">
          <div className="card-r relative bg-surface p-4 shadow-lg sm:p-5">
            <div className="flex items-center gap-4">
              {r.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.logo} alt="" className="size-16 shrink-0 rounded-2xl border border-line object-cover sm:size-20" />
              ) : (
                <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand text-2xl font-bold text-brand-ink sm:size-20">{name.slice(0, 1)}</div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-bold sm:text-2xl">{name}</h1>
                {pick(lang, r.descriptionAr, r.descriptionEn) && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{pick(lang, r.descriptionAr, r.descriptionEn)}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${menu.ordering.open ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-700"}`}>
                    <span className={`size-1.5 rounded-full ${menu.ordering.open ? "bg-emerald-500" : "bg-gray-500"}`} />
                    {menu.ordering.open || menu.ordering.reason !== "closed" ? t("menu.open") : t("menu.closed")}
                  </span>
                  {todayHours && <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-ink tabular-nums" dir="ltr"><IconClock className="size-3.5" />{todayHours}</span>}
                  {r.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[16rem] items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-ink"><IconPin className="size-3.5" /><span className="truncate">{r.address}</span></a>}
                  {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-ink"><IconPhone className="size-3.5" />{t("menu.call")}</a>}
                  {r.whatsapp && <a href={`https://wa.me/${r.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-ink"><IconChat className="size-3.5" />{t("menu.whatsapp")}</a>}
                </div>
              </div>
            </div>
          </div>
          {notice && <div role="status" className="card-r mt-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div>}
        </div>
      </header>

      {/* Promotions */}
      {menu.promotions.length > 0 && <Promotions menu={menu} lang={lang} onTarget={(target) => {
        const [kind, id] = target.split(":");
        if (kind === "category") goCategory(Number(id));
        if (kind === "product") { const p = menu.products.find((x) => x.id === Number(id)); if (p) setOpen({ product: p }); }
      }} />}

      {/* Search + categories (sticky) */}
      <div className="sticky top-0 z-30 mt-4 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 pt-3">
          <div className="flex gap-2">
            <label className="relative flex-1">
              <span className="sr-only">{t("menu.search")}</span>
              <svg className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("menu.search")} enterKeyHint="search"
                className="btn-r h-12 w-full border border-line bg-surface ps-10 pe-10 text-base outline-none focus:border-brand" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label={t("menu.clearSearch")} className="absolute end-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-canvas"><IconX className="size-4" /></button>}
            </label>
            <label className="relative">
              <span className="sr-only">{t("menu.sort")}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("menu.sort")}
                className="btn-r h-12 w-12 appearance-none border border-line bg-surface text-transparent outline-none focus:border-brand sm:w-auto sm:px-3 sm:text-ink">
                {(Object.keys(sortLabel) as Sort[]).map((s) => <option key={s} value={s} className="text-ink">{sortLabel[s]}</option>)}
              </select>
              <svg className="pointer-events-none absolute inset-0 m-auto size-5 text-ink sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" /></svg>
            </label>
            {hasSession && <MyOrderButton label={t("session.myOrder")} unread={session.unread} unreadLabel={t("session.unread")} onClick={() => openSession()} variant="bar" />}
          </div>
          {!results && (
            <div ref={chipsRef} className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-3" role="tablist">
              {menu.categories.map((c) => (
                <button key={c.id} type="button" data-chip={c.id} role="tab" aria-selected={activeCat === c.id} onClick={() => goCategory(c.id)}
                  className={`btn-r flex h-10 shrink-0 items-center gap-1.5 border px-4 text-sm font-medium transition ${activeCat === c.id ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink"}`}>
                  {pick(lang, c.nameAr, c.nameEn)}
                </button>
              ))}
            </div>
          )}
          {results && (
            <div className="flex items-center justify-between py-3 text-sm text-muted">
              <span>{results.length}</span>
              <label className="flex items-center gap-2"><input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />{t("menu.onlyAvailable")}</label>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4">
        {menu.products.length === 0 && <p className="py-20 text-center text-muted">{t("menu.empty")}</p>}

        {results ? (
          results.length === 0 ? (
            <div className="py-16 text-center">
              <IconSearch className="mx-auto size-10 text-muted" strokeWidth={1.5} />
              <p className="mt-3 font-semibold">{t("menu.noResults")}</p>
              <p className="mt-1 text-sm text-muted">{t("menu.noResultsHint")}</p>
              <button type="button" onClick={() => setQuery("")} className="btn-r mt-4 border border-line bg-surface px-4 py-2 text-sm font-medium">{t("menu.clearSearch")}</button>
            </div>
          ) : (
            <ProductGrid items={results} menu={menu} lang={lang} canOrder={canOrder} onOpen={(p) => setOpen({ product: p })} onAdd={quickAdd} layout={r.theme.layout} cardStyle={r.theme.cardStyle} />
          )
        ) : (
          <>
            {featured.length > 0 && sort === "default" && (
              <section className="mt-6" aria-labelledby="featured">
                <h2 id="featured" className="mb-3 flex items-center gap-2 text-lg font-bold"><IconStar className="size-5 text-accent" />{t("menu.featured")}</h2>
                <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
                  {featured.map((p) => (
                    <button key={p.id} type="button" onClick={() => setOpen({ product: p })} className="card-r w-60 shrink-0 snap-start overflow-hidden border border-line bg-surface text-start shadow-sm">
                      <div className="aspect-[4/3] bg-line">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.image ? <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Placeholder name={pick(lang, p.nameAr, p.nameEn)} />}
                      </div>
                      <div className="p-3">
                        <div className="line-clamp-1 font-semibold">{pick(lang, p.nameAr, p.nameEn)}</div>
                        <div className="mt-1 font-bold text-brand">{money(p.price, cur, lang)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {menu.categories.map((c) => {
              const items = sorted(byCategory.get(c.id) ?? []);
              if (!items.length) return null;
              return (
                <section key={c.id} data-cat={c.id} ref={(el) => { if (el) sectionRefs.current.set(c.id, el); else sectionRefs.current.delete(c.id); }}
                  className="scroll-mt-32 pt-7" aria-labelledby={`cat-${c.id}`}>
                  <h2 id={`cat-${c.id}`} className="mb-3 flex items-center gap-2 text-lg font-bold">
                    {pick(lang, c.nameAr, c.nameEn)}
                    <span className="text-sm font-normal text-muted">({items.length})</span>
                  </h2>
                  <ProductGrid items={items} menu={menu} lang={lang} canOrder={canOrder} onOpen={(p) => setOpen({ product: p })} onAdd={quickAdd} layout={r.theme.layout} cardStyle={r.theme.cardStyle} />
                </section>
              );
            })}
            {(byCategory.get(null) ?? []).length > 0 && (
              <section className="pt-7">
                <ProductGrid items={sorted(byCategory.get(null)!)} menu={menu} lang={lang} canOrder={canOrder} onOpen={(p) => setOpen({ product: p })} onAdd={quickAdd} layout={r.theme.layout} cardStyle={r.theme.cardStyle} />
              </section>
            )}
          </>
        )}
        {!tableToken && <RecentOrders slug={r.slug} lang={lang} />}
        <footer className="py-10 text-center text-xs text-muted">POS-SITEKOOM</footer>
      </main>

      {/* Floating cart bar */}
      {canOrder && count > 0 && !cartOpen && !open && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-40 px-4 pt-2">
          <button key={bump} type="button" onClick={() => setCartOpen(true)}
            className="btn-r animate-pop mx-auto mb-3 flex h-14 w-full max-w-xl items-center justify-between bg-brand px-5 text-brand-ink shadow-xl">
            <span className="flex items-center gap-3 font-semibold">
              <span className="grid size-8 place-items-center rounded-full bg-white/20 text-sm tabular-nums">{count}</span>
              {t("cart.view")}
            </span>
            <span className="font-bold tabular-nums">{money(total, cur, lang)}</span>
          </button>
        </div>
      )}

      {open && (
        <ProductSheet key={open.product.id + (open.edit?.key ?? "")} menu={menu} product={open.product} lang={lang} t={t} canOrder={canOrder}
          initial={open.edit ? { variantId: open.edit.variantId, modifierIds: open.edit.modifierIds, quantity: open.edit.quantity, note: open.edit.note } : undefined}
          onClose={() => { const back = !!open.edit; setOpen(null); if (back) setCartOpen(true); }}
          onAdd={(sel) => { add(open.product, sel, open.edit?.key); const back = !!open.edit; setOpen(null); if (back) setCartOpen(true); }} />
      )}
      {cartOpen && tableToken && (
        <CartSheet menu={menu} lang={lang} t={t} lines={lines} tableToken={tableToken} storageKey={storageKey} note={note} setNote={setNote}
          onQty={(key, qn) => setLines((ls) => (qn <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, quantity: qn } : l))))}
          onEdit={(line) => { const p = menu.products.find((x) => x.id === line.productId); if (p) { setCartOpen(false); setOpen({ product: p, edit: line }); } }}
          onClose={() => setCartOpen(false)}
          onSubmitted={(res) => {
            setLines([]); setNote("");
            try { localStorage.removeItem(`${storageKey}:cart`); } catch { /* ignore */ }
            setCartOpen(false);
            if (res.sessionToken) { session.setToken(res.sessionToken); openSession("orders"); }
            else window.location.assign(`/o/${res.trackingToken}`);
          }} />
      )}
      {sessionOpen && (
        <SessionSheet data={session.data} token={session.token} ended={session.ended} online={session.online} lang={lang} t={t} tab={sessionTab}
          onTab={setSessionTab} onClose={() => setSessionOpen(false)} onChanged={session.refresh} />
      )}
    </div>
  );
}

function ProductGrid(props: { items: Product[]; menu: Menu; lang: Lang; canOrder: boolean; layout: string; cardStyle: string; onOpen: (p: Product) => void; onAdd: (p: Product) => void }) {
  const { lang, menu } = props;
  const t = translator(lang);
  const card = props.cardStyle === "flat" ? "bg-surface" : props.cardStyle === "outline" ? "border border-line bg-surface" : "bg-surface shadow-sm ring-1 ring-black/5";
  if (props.layout === "list")
    return (
      <ul className="grid gap-3 md:grid-cols-2">
        {props.items.map((p) => (
          <li key={p.id}>
            <div className={`card-r flex gap-3 overflow-hidden p-3 ${card} ${p.available ? "" : "opacity-60"}`}>
              <button type="button" onClick={() => props.onOpen(p)} className="min-w-0 flex-1 text-start">
                <Badges p={p} lang={lang} />
                <div className="line-clamp-2 font-semibold leading-snug">{pick(lang, p.nameAr, p.nameEn)}</div>
                {pick(lang, p.descriptionAr, p.descriptionEn) && <p className="mt-1 line-clamp-2 text-sm text-muted">{pick(lang, p.descriptionAr, p.descriptionEn)}</p>}
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <span className="font-bold text-brand">{money(p.price, menu.restaurant.currency, lang)}</span>
                  <span className="flex items-center gap-1 text-muted"><ClockIcon />{t("menu.prepShort", p.prepMinutes)}</span>
                </div>
                {!p.available && <div className="mt-1 text-xs font-medium text-red-600">{t("menu.unavailable")}</div>}
              </button>
              <div className="relative size-28 shrink-0 overflow-hidden rounded-xl bg-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image ? <img src={p.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Placeholder name={pick(lang, p.nameAr, p.nameEn)} />}
                {props.canOrder && p.available && <AddButton onClick={() => props.onAdd(p)} label={t("product.add")} />}
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {props.items.map((p) => (
        <li key={p.id}>
          <div className={`card-r relative flex h-full flex-col overflow-hidden ${card} ${p.available ? "" : "opacity-60"}`}>
            <button type="button" onClick={() => props.onOpen(p)} className="flex flex-1 flex-col text-start">
              <div className="relative aspect-square w-full bg-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image ? <img src={p.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Placeholder name={pick(lang, p.nameAr, p.nameEn)} />}
                <div className="absolute start-2 top-2"><Badges p={p} lang={lang} /></div>
                {!p.available && <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs font-medium text-white">{t("menu.unavailable")}</div>}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <div className="line-clamp-2 text-[15px] font-semibold leading-snug">{pick(lang, p.nameAr, p.nameEn)}</div>
                <div className="mt-auto flex items-end justify-between gap-1 pt-2">
                  <span className="font-bold text-brand">{money(p.price, menu.restaurant.currency, lang)}</span>
                  <span className="flex items-center gap-0.5 text-xs text-muted"><ClockIcon />{t("menu.prepShort", p.prepMinutes)}</span>
                </div>
              </div>
            </button>
            {props.canOrder && p.available && <AddButton onClick={() => props.onAdd(p)} label={t("product.add")} top />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "My order": always reachable (hero and sticky bar), with a dot when something changed since the customer last looked. */
function MyOrderButton({ label, unread, unreadLabel, onClick, variant }: { label: string; unread: boolean; unreadLabel: string; onClick: () => void; variant: "hero" | "bar" }) {
  const base = variant === "hero"
    ? "rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold text-gray-900 shadow"
    : "btn-r h-12 shrink-0 border border-line bg-surface px-3 text-sm font-semibold text-ink";
  return (
    <button type="button" onClick={onClick} className={`relative flex items-center gap-1.5 ${base}`} aria-label={unread ? `${label} — ${unreadLabel}` : label}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" strokeLinejoin="round" /><path d="M9 8h6M9 12h6" strokeLinecap="round" />
      </svg>
      <span className={variant === "bar" ? "hidden sm:inline" : ""}>{label}</span>
      {unread && <span className="absolute -end-1 -top-1 flex size-3.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" /><span className="relative inline-flex size-3.5 rounded-full border-2 border-white bg-red-500" /></span>}
    </button>
  );
}

/** No photo: a calm brand-tinted tile with the dish's initial instead of an empty grey box. */
function Placeholder({ name }: { name: string }) {
  return (
    <div aria-hidden="true" className="grid h-full w-full place-items-center bg-gradient-to-br from-brand/15 via-brand/5 to-accent/10">
      <span className="text-4xl font-extrabold text-brand/35">{name.trim().slice(0, 1)}</span>
    </div>
  );
}

function AddButton({ onClick, label, top }: { onClick: () => void; label: string; top?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`absolute ${top ? "end-2 top-2" : "bottom-1.5 end-1.5"} grid size-10 place-items-center rounded-full bg-surface text-brand shadow-md ring-1 ring-black/5 active:scale-95`}><IconPlus className="size-5" strokeWidth={2.5} /></button>
  );
}

function Badges({ p, lang }: { p: Product; lang: Lang }) {
  const t = translator(lang);
  const label = pick(lang, p.labelAr, p.labelEn);
  if (!p.isNew && !label) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-1">
      {p.isNew && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-black">{t("menu.new")}</span>}
      {label && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-ink">{label}</span>}
    </div>
  );
}

function Promotions({ menu, lang, onTarget }: { menu: Menu; lang: Lang; onTarget: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const slides = menu.promotions;
  useEffect(() => {
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (paused.current || !ref.current) return;
      const next = (index + 1) % slides.length;
      const el = ref.current.children[next] as HTMLElement | undefined;
      el && ref.current.scrollTo({ left: el.offsetLeft - ref.current.offsetLeft, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(id);
  }, [index, slides.length]);
  return (
    <section className="mx-auto mt-4 max-w-5xl px-4" aria-roledescription="carousel">
      <div ref={ref} onPointerDown={() => (paused.current = true)}
        onScroll={(e) => { const el = e.currentTarget; setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth)); }}
        className="no-scrollbar card-r flex snap-x snap-mandatory overflow-x-auto">
        {slides.map((s) => {
          const title = pick(lang, s.titleAr, s.titleEn), sub = pick(lang, s.subtitleAr, s.subtitleEn), cta = pick(lang, s.ctaAr, s.ctaEn);
          const external = s.ctaTarget?.startsWith("https://");
          return (
            <div key={s.id} className="relative aspect-[16/9] w-full shrink-0 snap-center overflow-hidden sm:aspect-[21/8]">
              <picture>
                <source media="(max-width: 640px)" srcSet={s.mobileImage ?? undefined} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image ?? ""} alt={title || ""} className="h-full w-full object-cover" loading="lazy" />
              </picture>
              {(title || sub || cta) && (
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4 text-white sm:p-6">
                  {title && <h3 className="text-xl font-bold sm:text-2xl">{title}</h3>}
                  {sub && <p className="mt-1 text-sm opacity-90 sm:text-base">{sub}</p>}
                  {cta && s.ctaTarget && (external ? (
                    <a href={s.ctaTarget} target="_blank" rel="noopener noreferrer" className="btn-r mt-3 inline-flex w-fit bg-white px-4 py-2 text-sm font-semibold text-gray-900">{cta}</a>
                  ) : (
                    <button type="button" onClick={() => onTarget(s.ctaTarget!)} className="btn-r mt-3 w-fit bg-white px-4 py-2 text-sm font-semibold text-gray-900">{cta}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {slides.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
          {slides.map((s, i) => <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-brand" : "w-1.5 bg-line"}`} />)}
        </div>
      )}
    </section>
  );
}

function RecentOrders({ slug, lang }: { slug: string; lang: Lang }) {
  const [orders, setOrders] = useState<{ token: string; number: number; at: number }[]>([]);
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem("smenu:orders") ?? "[]") as { token: string; number: number; slug: string; at: number }[];
      setOrders(all.filter((o) => o.slug === slug && Date.now() - o.at < 12 * 3600_000).slice(0, 3));
    } catch { /* ignore */ }
  }, [slug]);
  if (!orders.length) return null;
  const t = translator(lang);
  return (
    <div className="mt-8 flex flex-wrap gap-2">
      {orders.map((o) => (
        <a key={o.token} href={`/o/${o.token}`} className="btn-r inline-flex items-center gap-1.5 border border-line bg-surface px-4 py-2 text-sm font-medium"><IconReceipt className="size-4" />{t("track.title", o.number)}</a>
      ))}
    </div>
  );
}
