import "server-only";
import { cookies } from "next/headers";
import { at, type AdminKey } from "@/lib/admin-i18n";
import { isLang, type Lang } from "@/lib/i18n";

export async function adminLang(): Promise<Lang> {
  const v = (await cookies()).get("lang")?.value;
  return isLang(v) ? v : "ar";
}

export async function adminT() {
  const lang = await adminLang();
  return { lang, t: (k: AdminKey, ...a: (string | number)[]) => at(lang, k, ...a) };
}
