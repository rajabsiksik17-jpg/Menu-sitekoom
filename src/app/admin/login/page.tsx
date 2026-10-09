import { redirect } from "next/navigation";
import { currentAdmin } from "@/server/admin-auth";
import { adminT } from "@/server/admin-lang";
import { startupProblem } from "@/server/bootstrap";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · POS-SITEKOOM" };

export default async function Page() {
  const problem = startupProblem();
  if (!problem && (await currentAdmin())) redirect("/admin");
  const { t } = await adminT();
  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-700 text-2xl text-white">🍽️</div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">{t("login.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("brand")}</p>
        </div>
        {problem && (
          <div role="alert" dir="auto" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-bold">إعداد الخادم غير مكتمل · Server setup incomplete</p>
            <p className="mt-1 break-words font-mono text-xs">{problem}</p>
            <p className="mt-2 text-xs">صحّح متغيرات البيئة ثم أعد تشغيل التطبيق.</p>
          </div>
        )}
        <LoginForm labels={{ email: t("login.email"), password: t("login.password"), submit: t("login.submit"), code: t("login.code") }} />
      </div>
    </main>
  );
}
