"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/client";
import { updateHoursAction } from "../../../../actions";

type Row = { day: number; open: string; close: string };

export function HoursEditor({ id, initial, days, labels }: { id: string; initial: Row[]; days: string[]; labels: Record<"add" | "day" | "open" | "close" | "save" | "remove", string> }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <ActionForm action={updateHoursAction} submit={labels.save}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="payload" value={JSON.stringify(rows)} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select aria-label={labels.day} value={r.day} onChange={(e) => set(i, { day: Number(e.target.value) })} className="input w-36">
              {days.map((d, k) => <option key={k} value={k}>{d}</option>)}
            </select>
            <input aria-label={labels.open} type="time" value={r.open} onChange={(e) => set(i, { open: e.target.value })} className="input w-32" />
            <span className="text-slate-400">→</span>
            <input aria-label={labels.close} type="time" value={r.close} onChange={(e) => set(i, { close: e.target.value })} className="input w-32" />
            <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setRows((x) => x.filter((_, k) => k !== i))}>{labels.remove}</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-secondary" onClick={() => setRows((x) => [...x, { day: x.length ? (x[x.length - 1]!.day + 1) % 7 : 0, open: "12:00", close: "23:00" }])}>+ {labels.add}</button>
    </ActionForm>
  );
}
