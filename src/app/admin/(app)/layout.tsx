import Link from "next/link";
import { requireAdmin } from "@/server/admin-auth";
import { adminT } from "@/server/admin-lang";
import { logoutAction, setLangAction } from "../actions";
import { LangToggle } from "@/components/admin/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "POS-SITEKOOM · Platform" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const { t, lang } = await adminT();
  const nav: [string, string, string][] = [
    ["/admin", "🏠", t("nav.dashboard")], ["/admin/restaurants", "🍽️", t("nav.restaurants")], ["/admin/orders", "🧾", t("nav.orders")],
    ["/admin/sync", "🔄", t("nav.sync")], ["/admin/audit", "📜", t("nav.audit")], ["/admin/settings", "⚙️", t("nav.settings")],
  ];
  return (
    <div className="min-h-dvh bg-slate-100 lg:flex">
      <aside className="no-print bg-slate-900 text-slate-200 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0">
        <div className="flex items-center justify-between gap-2 px-5 py-4 lg:block">
          <Link href="/admin" className="block">
            <div className="text-lg font-bold text-white">POS-SITEKOOM</div>
            <div className="text-xs text-slate-400">{t("brand")}</div>
          </Link>
          <div className="flex items-center gap-3 lg:hidden">
            <LangToggle action={setLangAction} label={t("nav.language")} next={lang === "ar" ? "en" : "ar"} />
          </div>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible">
          {nav.map(([href, icon, label]) => (
            <Link key={href} href={href} className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-800 hover:text-white">
              <span aria-hidden="true">{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-slate-800 px-5 py-4 text-sm lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <div className="truncate font-medium text-white">{admin.name}</div>
          <div className="truncate text-xs text-slate-400" dir="ltr">{admin.email}</div>
          <div className="mt-3 flex items-center justify-between">
            <LangToggle action={setLangAction} label={t("nav.language")} next={lang === "ar" ? "en" : "ar"} />
            <form action={logoutAction}><button className="text-slate-300 hover:text-white">{t("nav.logout")}</button></form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
