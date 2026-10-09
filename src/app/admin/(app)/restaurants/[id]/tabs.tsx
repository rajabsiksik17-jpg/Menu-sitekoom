"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function RestaurantTabs({ base, tabs }: { base: string; tabs: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {tabs.map(([seg, label]) => {
        const href = seg ? `${base}/${seg}` : base;
        const active = seg ? path.startsWith(href) : path === base;
        return (
          <Link key={seg} href={href} aria-current={active ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition ${active ? "border-blue-700 text-blue-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
