"use client";

import { useActionState } from "react";
import { ActionForm, Submit, errorText, useLang } from "@/components/admin/client";
import { confirmTotpAction, disableTotpAction, startTotpAction } from "../../actions";

/** Two-factor sign-in: start → scan the QR (or type the key) → confirm with the first code. Turning it off needs password + code. */
type Labels = Record<"on" | "off" | "enable" | "scan" | "manual" | "confirm" | "disable" | "code" | "password", string>;

export function TotpPanel({ enabled, labels }: { enabled: boolean; labels: Labels }) {
  const [setup, start] = useActionState(startTotpAction, null);
  const lang = useLang();
  if (enabled)
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ {labels.on}</p>
        <ActionForm action={disableTotpAction} submit={labels.disable} danger>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="password" name="password" required placeholder={labels.password} autoComplete="current-password" className="input" />
            <input name="code" required inputMode="numeric" maxLength={7} placeholder={labels.code} dir="ltr" className="input tracking-widest" />
          </div>
        </ActionForm>
      </div>
    );
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{labels.off}</p>
      {!setup?.data ? (
        <form action={start}>
          <Submit>{labels.enable}</Submit>
          {setup?.error && <span role="alert" className="ms-3 text-sm text-red-600">{errorText(setup.error, lang)}</span>}
        </form>
      ) : (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <p className="text-sm">{labels.scan}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.data.qr} alt="" width={220} height={220} className="rounded-lg border border-slate-200" />
          <p className="text-xs text-slate-500">{labels.manual} <code dir="ltr" className="select-all break-all font-mono text-slate-800">{setup.data.secret}</code></p>
          <ActionForm action={confirmTotpAction} submit={labels.confirm}>
            <input name="code" required inputMode="numeric" maxLength={7} placeholder={labels.code} dir="ltr" className="input max-w-48 tracking-widest" autoFocus />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
