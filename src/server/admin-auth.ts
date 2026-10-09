import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { adminSessions, platformAdmins } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { verifyLogin } from "./admins";

/** "__Host-" cookies are bound to this exact host, HTTPS only, path "/" (no sub-domain can set or read them). */
export const SESSION_COOKIE = () => (env.secureCookies ? "__Host-smenu_admin" : "smenu_admin");
const SESSION_HOURS = 12;

export type Admin = { id: string; email: string; name: string; sessionId: string };

export async function requestIp() {
  const h = await headers();
  if (env.trustProxy) return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
  return "local";
}

/**
 * Platform administrators (the platform owner and staff). Passwords are scrypt hashes, 5 failures lock the account for
 * 15 minutes, two-factor sign-in with an authenticator app when enabled, and the session cookie is a random token
 * (HttpOnly, SameSite=Lax, Secure, __Host- prefix in production) of which only the SHA-256 is stored. Rate limited per IP and e-mail.
 */
export async function login(email: string, password: string, code: string | null): Promise<void> {
  const ip = await requestIp();
  const normalized = email.trim().toLowerCase();
  if (!rateLimit(`login:${ip}`, 10, 2) || !rateLimit(`login:${normalized}`, 10, 2)) throw new AppError("rate_limited", 429);
  const db = await getDb();
  const a = await verifyLogin(db, normalized, password, code?.trim() || null, ip);
  const token = randomToken(32);
  const h = await headers();
  await db.insert(adminSessions).values({
    id: sha256(token), adminId: a.id, expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000), ip, userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
  });
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
  await audit(db, null, { type: "admin", id: a.id, ip }, "admin.login");
  (await cookies()).set(SESSION_COOKIE(), token, { httpOnly: true, sameSite: "lax", secure: env.secureCookies, path: "/", maxAge: SESSION_HOURS * 3600 });
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE())?.value;
  if (token) (await getDb()).delete(adminSessions).where(eq(adminSessions.id, sha256(token))).then(() => undefined, () => undefined);
  jar.delete(SESSION_COOKIE());
}

export async function currentAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(SESSION_COOKIE())?.value;
  if (!token || token.length < 40) return null;
  const db = await getDb();
  const [row] = await db.select({ id: platformAdmins.id, email: platformAdmins.email, name: platformAdmins.name, active: platformAdmins.isActive })
    .from(adminSessions).innerJoin(platformAdmins, eq(platformAdmins.id, adminSessions.adminId))
    .where(and(eq(adminSessions.id, sha256(token)), gt(adminSessions.expiresAt, new Date()))).limit(1);
  return row && row.active ? { id: row.id, email: row.email, name: row.name, sessionId: sha256(token) } : null;
}

/** Pages and server actions of the dashboard call this first: no session → login page. */
export async function requireAdmin(): Promise<Admin> {
  const a = await currentAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

export { createAdmin } from "./admins";
