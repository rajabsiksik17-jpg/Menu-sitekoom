"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/admin/actions";

const errors: Record<string, [string, string]> = {
  slug_taken: ["هذا المعرّف مستخدم لمطعم آخر", "This identifier is already used"],
  slug_reserved: ["هذا المعرّف محجوز للنظام", "This identifier is reserved"],
  invalid_credentials: ["بيانات الدخول غير صحيحة", "Invalid credentials"],
  rate_limited: ["محاولات كثيرة، انتظر قليلاً", "Too many attempts, please wait"],
  geo_incomplete: ["حدّد الموقع ونصف القطر أو ارسم مضلعاً قبل التفعيل", "Set the point and radius or draw a polygon before enabling"],
  geo_invalid_point: ["إحداثيات غير صحيحة", "Invalid coordinates"],
  geo_invalid_polygon: ["المضلع غير صالح (3 نقاط على الأقل)", "Invalid polygon (at least 3 points)"],
  image_invalid: ["الملف ليس صورة صالحة", "The file is not a valid image"],
  image_too_large: ["الصورة أكبر من 8 ميجابايت", "Image larger than 8 MB"],
  promotion_image_required: ["الصورة مطلوبة للبنر", "An image is required"],
  promotion_dates: ["تاريخ الانتهاء يجب أن يكون بعد البداية", "End must be after start"],
  password_too_short: ["كلمة المرور قصيرة (12 حرفاً على الأقل)", "Password too short (12+ characters)"],
  not_found: ["غير موجود", "Not found"],
  totp_required: ["أدخل رمز التحقق من تطبيق المصادقة", "Enter the code from your authenticator app"],
  totp_invalid: ["رمز التحقق غير صحيح أو مستخدم مسبقاً", "Wrong or already used code"],
  account_locked: ["الحساب مقفل مؤقتاً بعد محاولات خاطئة — حاول بعد 15 دقيقة", "Account locked after failed attempts — try again in 15 minutes"],
  email_invalid: ["البريد الإلكتروني غير صحيح", "Invalid email"],
  email_taken: ["البريد مستخدم لمدير آخر", "Email already used"],
  name_required: ["الاسم مطلوب", "Name required"],
  cannot_disable_self: ["لا يمكنك تعطيل حسابك", "You cannot disable yourself"],
  totp_not_started: ["ابدأ التفعيل أولاً", "Start the setup first"],
  totp_already_enabled: ["التحقق بخطوتين مفعّل مسبقاً", "Already enabled"],
  server_error: ["حدث خطأ غير متوقع، راجع السجلات", "Unexpected error — see the logs"],
};

export function useLang() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  useEffect(() => setLang(document.documentElement.lang === "en" ? "en" : "ar"), []);
  return lang;
}

export function errorText(code: string, lang: "ar" | "en") {
  const e = errors[code];
  return e ? e[lang === "en" ? 1 : 0] : code;
}

/** A form bound to a server action, with pending state and a success / error line. */
export function ActionForm(props: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; children: React.ReactNode; submit: string; className?: string;
  savedText?: string; onResult?: (s: ActionState) => void; danger?: boolean; footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(props.action, null);
  const lang = useLang();
  const cb = useRef(props.onResult);
  cb.current = props.onResult;
  useEffect(() => { if (state) cb.current?.(state); }, [state]);
  return (
    <form action={formAction} className={props.className ?? "space-y-4"}>
      {props.children}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Submit danger={props.danger}>{props.submit}</Submit>
        {props.footer}
        {state?.error && <span role="alert" className="text-sm text-red-600">{errorText(state.error, lang)}</span>}
        {state?.ok && state.message === "saved" && <span className="text-sm text-emerald-700">✓ {props.savedText ?? (lang === "en" ? "Saved" : "تم الحفظ")}</span>}
      </div>
    </form>
  );
}

export function Submit({ children, danger, small }: { children: React.ReactNode; danger?: boolean; small?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${danger ? "btn-danger" : "btn-primary"} ${small ? "!px-3 !py-1.5 text-xs" : ""}`}>
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Small POST form for row actions, with an optional confirmation. */
export function RowAction(props: { action: (fd: FormData) => Promise<void>; fields: Record<string, string>; label: string; confirm?: string; danger?: boolean }) {
  return (
    <form action={props.action} onSubmit={(e) => { if (props.confirm && !window.confirm(props.confirm)) e.preventDefault(); }} className="inline">
      {Object.entries(props.fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit small danger={props.danger}>{props.label}</Submit>
    </form>
  );
}

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { window.prompt("", text); }
    }}>{ok ? `✓ ${done}` : label}</button>
  );
}

export function LangToggle({ action, label, next }: { action: (lang: string) => Promise<void>; label: string; next: string }) {
  return <button type="button" onClick={() => action(next)} className="text-sm text-slate-300 hover:text-white">{label}</button>;
}

export function ImageInput({ name, current, label, removeName, removeLabel }: { name: string; current: string | null; label: string; removeName?: string; removeLabel?: string }) {
  const [preview, setPreview] = useState<string | null>(current);
  return (
    <div className="flex items-center gap-4">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="text-2xl text-slate-300">🖼</span>}
      </div>
      <div className="space-y-2">
        <label className="btn-secondary cursor-pointer">
          {label}
          <input type="file" name={name} accept="image/png,image/jpeg,image/webp" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
        </label>
        {removeName && current && (
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name={removeName} /> {removeLabel}</label>
        )}
      </div>
    </div>
  );
}
