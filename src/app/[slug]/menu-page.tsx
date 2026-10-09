import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { loadPublicMenu } from "@/server/menu";
import { isLang, pick, translator, type Lang } from "@/lib/i18n";
import { MenuApp } from "@/components/menu/MenuApp";
import { IconUtensils } from "@/components/menu/icons";

export async function menuMetadata(slug: string): Promise<Metadata> {
  const menu = await loadPublicMenu(await getDb(), slug, null);
  if (!menu) return { title: "Menu" };
  return { title: menu.restaurant.nameAr, description: menu.restaurant.descriptionAr ?? undefined };
}

/** Shared by the browse page (/slug) and the table page (/slug/t/token). Always rendered fresh (prices, availability). */
export async function MenuPage({ slug, token }: { slug: string; token: string | null }) {
  const menu = await loadPublicMenu(await getDb(), slug, token);
  if (!menu) notFound();
  const cookieLang = (await cookies()).get("lang")?.value;
  const preferred: Lang = isLang(cookieLang) ? cookieLang : isLang(menu.restaurant.defaultLang) ? menu.restaurant.defaultLang : "ar";
  const lang: Lang = menu.restaurant.languages.includes(preferred) ? preferred : (menu.restaurant.languages[0] as Lang) ?? "ar";
  if (!menu.restaurant.service.active && menu.restaurant.service.reason !== "expired") {
    const t = translator(lang);
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <IconUtensils className="mx-auto size-14 text-gray-400" strokeWidth={1.5} />
          <h1 className="mt-4 text-xl font-bold">{pick(lang, menu.restaurant.nameAr, menu.restaurant.nameEn)}</h1>
          <p className="mt-2 text-gray-600">{t("menu.unavailableRestaurant")}</p>
        </div>
      </main>
    );
  }
  return <MenuApp menu={menu} lang={lang} tableToken={menu.table.kind === "ok" ? token : null} />;
}
