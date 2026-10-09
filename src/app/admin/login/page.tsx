import { redirect } from "next/navigation";
import { currentAdmin } from "@/server/admin-auth";
import { adminT } from "@/server/admin-lang";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · POS-SITEKOOM" };

export default async function Page() {
  if (await currentAdmin()) redirect("/admin");
  const { t } = await adminT();
  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-700 text-2xl text-white">🍽️</div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">{t("login.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("brand")}</p>
        </div>
        <LoginForm labels={{ email: t("login.email"), password: t("login.password"), submit: t("login.submit"), code: t("login.code") }} />
      </div>
    </main>
  );
}
