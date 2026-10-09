import { and, desc, eq, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { adminSessions, platformAdmins } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { newTotpSecret, otpauthUrl, seal, unseal, verifyTotp } from "@/lib/totp";
import { audit, type Actor } from "@/lib/audit";

/** Platform administrators: accounts, sign-in checks, two-factor sign-in. No Next.js request APIs here (usable from scripts). */

export const MIN_PASSWORD = 12;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/** Creates or resets a platform administrator (CLI scripts / first start). */
export async function createAdmin(db: Db, email: string, name: string, password: string) {
  if (password.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
  const hash = await hashPassword(password);
  const [a] = await db.insert(platformAdmins).values({ email: email.trim().toLowerCase(), name, passwordHash: hash })
    .onConflictDoUpdate({ target: platformAdmins.email, set: { name, passwordHash: hash, isActive: true, failedLogins: 0, lockedUntil: null } }).returning();
  return a!;
}

/**
 * Sign-in decision: password (always one hash verification, so timing does not reveal unknown e-mails), account lock
 * after 5 failures for 15 minutes, and the authenticator code when two-factor sign-in is on (each code accepted once).
 */
export async function verifyLogin(db: Db, email: string, password: string, code: string | null, ip: string, now = new Date()) {
  const normalized = email.trim().toLowerCase();
  const [a] = await db.select().from(platformAdmins).where(eq(platformAdmins.email, normalized)).limit(1);
  const ok = await verifyPassword(password, a?.passwordHash ?? DUMMY_HASH);
  const fail = async (reason: string): Promise<never> => {
    if (a && reason !== "totp_required" && reason !== "account_locked") {
      const failures = a.failedLogins + 1;
      await db.update(platformAdmins).set({
        failedLogins: failures >= MAX_FAILURES ? 0 : failures,
        lockedUntil: failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : a.lockedUntil,
      }).where(eq(platformAdmins.id, a.id));
    }
    await audit(db, null, { type: "admin", id: a?.id ?? null, ip }, "admin.login_failed", { email: normalized, reason });
    throw new AppError(["totp_required", "totp_invalid", "account_locked"].includes(reason) ? reason : "invalid_credentials", 401);
  };
  if (a?.lockedUntil && a.lockedUntil > now) return fail("account_locked");
  if (!a || !ok || !a.isActive) return fail("invalid_credentials");
  if (a.totpEnabled) {
    if (!code) return fail("totp_required");
    const secret = a.totpSecret ? unseal(a.totpSecret) : null;
    const step = secret ? verifyTotp(secret, code, a.totpLastStep, now.getTime()) : null;
    if (step === null) return fail("totp_invalid");
    await db.update(platformAdmins).set({ totpLastStep: step }).where(eq(platformAdmins.id, a.id));
  }
  await db.update(platformAdmins).set({ lastLoginAt: now, failedLogins: 0, lockedUntil: null }).where(eq(platformAdmins.id, a.id));
  return { id: a.id, email: a.email, name: a.name };
}

export async function changePassword(db: Db, adminId: string, current: string, next: string, actor: Actor) {
  const [a] = await db.select().from(platformAdmins).where(eq(platformAdmins.id, adminId)).limit(1);
  if (!a || !(await verifyPassword(current, a.passwordHash))) throw new AppError("invalid_credentials");
  if (next.length < MIN_PASSWORD) throw new AppError("password_too_short");
  await db.update(platformAdmins).set({ passwordHash: await hashPassword(next) }).where(eq(platformAdmins.id, adminId));
  await audit(db, null, actor, "admin.password_changed");
}

// ── Two-factor sign-in ─────────────────────────────────────────────────────

/** Step 1: a new secret (stored sealed, not active yet) and the otpauth link to show as a QR code. */
export async function startTotp(db: Db, adminId: string) {
  const [a] = await db.select().from(platformAdmins).where(eq(platformAdmins.id, adminId)).limit(1);
  if (!a) throw new AppError("not_found", 404);
  if (a.totpEnabled) throw new AppError("totp_already_enabled");
  const secret = newTotpSecret();
  await db.update(platformAdmins).set({ totpSecret: seal(secret), totpLastStep: null }).where(eq(platformAdmins.id, adminId));
  return { secret, url: otpauthUrl(secret, a.email) };
}

/** Step 2: the first code from the app proves it was set up correctly; only then sign-in requires it. */
export async function confirmTotp(db: Db, adminId: string, code: string, actor: Actor) {
  const [a] = await db.select().from(platformAdmins).where(eq(platformAdmins.id, adminId)).limit(1);
  const secret = a?.totpSecret ? unseal(a.totpSecret) : null;
  if (!a || !secret) throw new AppError("totp_not_started");
  const step = verifyTotp(secret, code, null);
  if (step === null) throw new AppError("totp_invalid");
  await db.update(platformAdmins).set({ totpEnabled: true, totpLastStep: step }).where(eq(platformAdmins.id, adminId));
  await audit(db, null, actor, "admin.totp_enabled");
}

export async function disableTotp(db: Db, adminId: string, password: string, code: string, actor: Actor) {
  const [a] = await db.select().from(platformAdmins).where(eq(platformAdmins.id, adminId)).limit(1);
  if (!a || !(await verifyPassword(password, a.passwordHash))) throw new AppError("invalid_credentials");
  const secret = a.totpSecret ? unseal(a.totpSecret) : null;
  if (a.totpEnabled && (!secret || verifyTotp(secret, code, a.totpLastStep) === null)) throw new AppError("totp_invalid");
  await db.update(platformAdmins).set({ totpEnabled: false, totpSecret: null, totpLastStep: null }).where(eq(platformAdmins.id, adminId));
  await audit(db, null, actor, "admin.totp_disabled");
}

// ── Administrators ─────────────────────────────────────────────────────────

export async function listAdmins(db: Db) {
  return db.select({ id: platformAdmins.id, email: platformAdmins.email, name: platformAdmins.name, isActive: platformAdmins.isActive,
    totpEnabled: platformAdmins.totpEnabled, lastLoginAt: platformAdmins.lastLoginAt, lockedUntil: platformAdmins.lockedUntil })
    .from(platformAdmins).orderBy(desc(platformAdmins.createdAt));
}

export async function addAdmin(db: Db, email: string, name: string, password: string, actor: Actor) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AppError("email_invalid");
  if (!name.trim()) throw new AppError("name_required");
  if (password.length < MIN_PASSWORD) throw new AppError("password_too_short");
  const [dup] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(eq(platformAdmins.email, e)).limit(1);
  if (dup) throw new AppError("email_taken", 409);
  const [a] = await db.insert(platformAdmins).values({ email: e, name: name.trim(), passwordHash: await hashPassword(password) }).returning();
  await audit(db, null, actor, "admin.created", { email: e });
  return a!;
}

/** Disabling an administrator ends all of their sessions at once. Nobody can disable themselves. */
export async function setAdminActive(db: Db, targetId: string, active: boolean, actor: Actor) {
  if (targetId === actor.id) throw new AppError("cannot_disable_self");
  const res = await db.update(platformAdmins).set({ isActive: active, failedLogins: 0, lockedUntil: null }).where(eq(platformAdmins.id, targetId)).returning({ email: platformAdmins.email });
  if (!res.length) throw new AppError("not_found", 404);
  if (!active) await db.delete(adminSessions).where(eq(adminSessions.adminId, targetId));
  await audit(db, null, actor, active ? "admin.enabled" : "admin.disabled", { email: res[0]!.email });
}

export async function signOutOtherSessions(db: Db, adminId: string, currentSessionId: string, actor: Actor) {
  const removed = await db.delete(adminSessions).where(and(eq(adminSessions.adminId, adminId), ne(adminSessions.id, currentSessionId))).returning({ id: adminSessions.id });
  await audit(db, null, actor, "admin.sessions_revoked", { count: removed.length });
  return removed.length;
}

export async function listSessions(db: Db, adminId: string) {
  return db.select().from(adminSessions).where(eq(adminSessions.adminId, adminId)).orderBy(desc(adminSessions.createdAt));
}
