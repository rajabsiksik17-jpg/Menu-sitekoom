"use server";

import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { refresh } from "next/cache";
import { ZodError } from "zod";
import { getDb } from "@/db";
import { AppError } from "@/lib/errors";
import { storeImage } from "@/lib/media";
import { audit, type Actor } from "@/lib/audit";
import { login, logout, requireAdmin, requestIp } from "@/server/admin-auth";
import * as admin from "@/server/admin";
import * as admins from "@/server/admins";
import { log } from "@/lib/log";

export type ActionState = { ok?: boolean; error?: string; message?: string; data?: Record<string, string> } | null;

async function actor(): Promise<Actor> {
  const a = await requireAdmin();
  return { type: "admin", id: a.id, ip: await requestIp() };
}

/** Uniform error handling: known errors become a code for the form, unexpected ones are logged. */
async function run(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const r = await fn();
    return r ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { error: e.code };
    if (e instanceof ZodError) return { error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join(" · ") };
    log.error("admin.action", { error: e instanceof Error ? e.message : String(e) });
    return { error: "server_error" };
  }
}

const str = (fd: FormData, k: string) => (fd.get(k) as string | null) ?? "";
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

async function upload(fd: FormData, key: string, restaurantId: string) {
  const f = fd.get(key);
  if (!(f instanceof File) || f.size === 0) return undefined;
  const m = await storeImage(await getDb(), restaurantId, Buffer.from(await f.arrayBuffer()), "admin");
  return m.id;
}

// ── Session ────────────────────────────────────────────────────────────────

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await login(str(fd, "email"), str(fd, "password"), str(fd, "code") || null);
  } catch (e) {
    // The e-mail is kept in the form (React resets fields after an action), never the password.
    if (e instanceof AppError) return { error: e.code, data: { email: str(fd, "email") } };
    throw e;
  }
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function setLangAction(lang: string) {
  (await cookies()).set("lang", lang === "en" ? "en" : "ar", { path: "/", maxAge: 31536000, sameSite: "lax" });
  refresh();
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await admins.changePassword(await getDb(), (await requireAdmin()).id, str(fd, "current"), str(fd, "next"), await actor());
    return { ok: true, message: "saved" };
  });
}

// ── Security: two-factor sign-in, administrators, sessions ────────────────

export async function startTotpAction(_: ActionState): Promise<ActionState> {
  return run(async () => {
    const a = await requireAdmin();
    const { secret, url } = await admins.startTotp(await getDb(), a.id);
    const QRCode = (await import("qrcode")).default;
    return { ok: true, data: { secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: "M" }) } };
  });
}

export async function confirmTotpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await admins.confirmTotp(await getDb(), (await requireAdmin()).id, str(fd, "code"), await actor());
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function disableTotpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await admins.disableTotp(await getDb(), (await requireAdmin()).id, str(fd, "password"), str(fd, "code"), await actor());
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function addAdminAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await admins.addAdmin(await getDb(), str(fd, "email"), str(fd, "name"), str(fd, "password"), await actor());
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function setAdminActiveAction(fd: FormData) {
  await run(async () => {
    await admins.setAdminActive(await getDb(), str(fd, "adminId"), str(fd, "active") === "true", await actor());
    refresh();
  });
}

export async function signOutOthersAction(fd: FormData) {
  void fd;
  await run(async () => {
    const a = await requireAdmin();
    await admins.signOutOtherSessions(await getDb(), a.id, a.sessionId, await actor());
    refresh();
  });
}

// ── Restaurants ────────────────────────────────────────────────────────────

function restaurantInput(fd: FormData): admin.RestaurantInput {
  const langs = fd.getAll("languages").map(String).filter((l): l is "ar" | "en" => l === "ar" || l === "en");
  return {
    slug: str(fd, "slug"), nameAr: str(fd, "nameAr"), nameEn: str(fd, "nameEn"), descriptionAr: str(fd, "descriptionAr"), descriptionEn: str(fd, "descriptionEn"),
    phone: str(fd, "phone"), whatsapp: str(fd, "whatsapp"), address: str(fd, "address"), licenseCustomer: str(fd, "licenseCustomer"),
    installationCode: str(fd, "installationCode"), showContact: bool(fd, "showContact"),
    defaultLang: str(fd, "defaultLang") === "en" ? "en" : "ar", languages: langs.length ? langs : ["ar"], timezone: str(fd, "timezone") || "Asia/Amman",
  };
}

export async function createRestaurantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await run(async () => {
    const r = await admin.createRestaurant(await getDb(), restaurantInput(fd), await actor());
    id = r.id;
  });
  if (res?.error) return res;
  redirect(`/admin/restaurants/${id}`);
}

export async function updateRestaurantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await admin.updateRestaurant(await getDb(), str(fd, "id"), restaurantInput(fd), await actor());
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function updateServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await admin.updateService(await getDb(), str(fd, "id"), {
      status: str(fd, "status") as "draft" | "active" | "suspended", serviceExpiresAt: str(fd, "serviceExpiresAt"), orderingPaused: bool(fd, "orderingPaused"),
    }, await actor());
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function enrollmentCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const { code, expiresAt } = await admin.createEnrollmentCode(await getDb(), str(fd, "id"), await actor());
    return { ok: true, data: { code, expiresAt: expiresAt.toISOString() } };
  });
}

export async function revokeDeviceAction(fd: FormData) {
  await run(async () => {
    await admin.revokeDevice(await getDb(), str(fd, "id"), str(fd, "deviceId"), await actor());
    refresh();
  });
}

export async function updateBrandingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const id = str(fd, "id");
    const a = await actor();
    const logo = bool(fd, "removeLogo") ? null : await upload(fd, "logo", id);
    const cover = bool(fd, "removeCover") ? null : await upload(fd, "cover", id);
    await admin.updateBranding(await getDb(), id, {
      primary: str(fd, "primary"), secondary: str(fd, "secondary"),
      background: str(fd, "background") as "light", buttonStyle: str(fd, "buttonStyle") as "rounded", cardStyle: str(fd, "cardStyle") as "elevated", layout: str(fd, "layout") as "grid",
    }, { logo, cover }, a);
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function updateGeoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const v = JSON.parse(str(fd, "payload") || "{}");
    await admin.updateGeo(await getDb(), str(fd, "id"), v, await actor());
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function updateHoursAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await admin.updateHours(await getDb(), str(fd, "id"), JSON.parse(str(fd, "payload") || "[]"), await actor());
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function rotateTableAction(fd: FormData) {
  await run(async () => {
    await admin.adminRotateTable(await getDb(), str(fd, "id"), str(fd, "uid"), await actor());
    refresh();
  });
}

export async function updatePresentationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await admin.updatePresentation(await getDb(), str(fd, "id"), Number(str(fd, "productPosId")), {
      isFeatured: bool(fd, "isFeatured"), isNew: bool(fd, "isNew"), labelAr: str(fd, "labelAr"), labelEn: str(fd, "labelEn"),
    }, await actor());
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function savePromotionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const id = str(fd, "id");
    const promoId = str(fd, "promotionId") || null;
    const image = await upload(fd, "image", id);
    const mobile = bool(fd, "removeMobile") ? null : await upload(fd, "mobileImage", id);
    await admin.savePromotion(await getDb(), id, promoId, {
      titleAr: str(fd, "titleAr"), titleEn: str(fd, "titleEn"), subtitleAr: str(fd, "subtitleAr"), subtitleEn: str(fd, "subtitleEn"),
      ctaAr: str(fd, "ctaAr"), ctaEn: str(fd, "ctaEn"), ctaTarget: str(fd, "ctaTarget"), sort: Number(str(fd, "sort") || 0),
      isActive: bool(fd, "isActive"), startsAt: str(fd, "startsAt"), endsAt: str(fd, "endsAt"),
    }, { image, mobile }, await actor());
    refresh();
    return { ok: true, message: "saved" };
  });
}

export async function archivePromotionAction(fd: FormData) {
  await run(async () => {
    await admin.archivePromotion(await getDb(), str(fd, "id"), str(fd, "promotionId"), await actor());
    refresh();
  });
}
