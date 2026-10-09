"use client";

import { useEffect, useRef } from "react";
import { IconX } from "./icons";

/** Bottom sheet on phones, centred dialog on larger screens. Esc / backdrop close; focus is moved inside and restored. */
export function Sheet(props: { children: React.ReactNode; onClose: () => void; label: string; closeLabel: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={props.label}>
      <button type="button" aria-label={props.closeLabel} className="animate-fade absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={props.onClose} />
      <div ref={ref} tabIndex={-1}
        className={`animate-sheet relative w-full overflow-hidden rounded-t-3xl bg-surface text-ink shadow-2xl outline-none sm:rounded-3xl ${props.wide ? "sm:max-w-xl" : "sm:max-w-lg"}`}>
        <div className="absolute inset-x-0 top-2 z-10 mx-auto h-1.5 w-10 rounded-full bg-black/20 sm:hidden" aria-hidden="true" />
        <button type="button" onClick={props.onClose} aria-label={props.closeLabel}
          className="absolute end-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/55"><IconX /></button>
        {props.children}
      </div>
    </div>
  );
}
