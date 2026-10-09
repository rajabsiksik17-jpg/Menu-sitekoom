"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/client";
import { enrollmentCodeAction } from "../../../actions";

/** Generates a one-time POS connection code and shows it once (it is stored only as a hash). */
export function EnrollmentCode({ id, labels }: { id: string; labels: { create: string; hint: string; shown: string; valid: string } }) {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  return (
    <div>
      <ActionForm action={enrollmentCodeAction} submit={labels.create} onResult={(s) => s?.data?.code && setCode({ code: s.data.code, expiresAt: s.data.expiresAt! })}>
        <input type="hidden" name="id" value={id} />
        <p className="text-sm text-slate-600">{labels.hint}</p>
      </ActionForm>
      {code && (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-4 text-center">
          <div className="text-xs text-blue-800">{labels.shown}</div>
          <div className="mt-1 select-all font-mono text-3xl font-bold tracking-widest text-blue-900" dir="ltr">{code.code}</div>
          <div className="mt-1 text-xs text-blue-800">{labels.valid.replace("{0}", new Date(code.expiresAt).toLocaleTimeString())}</div>
        </div>
      )}
    </div>
  );
}
