"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import { Submit, errorText, useLang } from "@/components/admin/client";

export function LoginForm({ labels }: { labels: { email: string; password: string; submit: string; code: string } }) {
  const [state, action] = useActionState(loginAction, null);
  const lang = useLang();
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{labels.email}</span>
        <input name="email" type="email" required autoComplete="username" dir="ltr" className="input" defaultValue={state?.data?.email ?? ""} key={state?.data?.email} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{labels.password}</span>
        <input name="password" type="password" required autoComplete="current-password" dir="ltr" className="input" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{labels.code}</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} dir="ltr" className="input tracking-widest"
          autoFocus={state?.error === "totp_required"} />
      </label>
      {state?.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorText(state.error, lang)}</p>}
      <div className="[&>button]:w-full"><Submit>{labels.submit}</Submit></div>
    </form>
  );
}
