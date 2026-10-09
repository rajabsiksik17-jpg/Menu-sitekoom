import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { addAdmin, confirmTotp, createAdmin, setAdminActive, startTotp, verifyLogin } from "@/server/admins";
import { base32Encode, currentStep, seal, totpAt, unseal, verifyTotp } from "@/lib/totp";
import { AppError } from "@/lib/errors";
import { RESERVED_SLUGS } from "@/server/admin";
import { freshDb } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return e instanceof AppError ? e.code : String(e); }
};

describe("two-factor codes", () => {
  it("match the RFC 6238 test vector and are accepted once", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
    const now = Date.now();
    const c = totpAt(secret, currentStep(now));
    const step = verifyTotp(secret, c, null, now);
    expect(step).toBe(currentStep(now));
    expect(verifyTotp(secret, c, step, now)).toBeNull(); // replay refused
    expect(verifyTotp(secret, "000000", null, now === 0 ? 1 : now)).toBeNull();
  });

  it("secrets are sealed at rest", () => {
    const s = seal("JBSWY3DPEHPK3PXP");
    expect(s).not.toContain("JBSWY3DPEHPK3PXP");
    expect(unseal(s)).toBe("JBSWY3DPEHPK3PXP");
    expect(unseal(s.slice(0, -2) + "xx")).toBeNull(); // tampered
  });
});

describe("administrator sign-in", () => {
  it("locks the account after 5 wrong passwords, even for the right one", async () => {
    await createAdmin(db, "owner@test.com", "Owner", "correct-horse-battery");
    for (let i = 0; i < 5; i++) expect(await code(verifyLogin(db, "owner@test.com", "wrong", null, "ip"))).toBe("invalid_credentials");
    expect(await code(verifyLogin(db, "owner@test.com", "correct-horse-battery", null, "ip"))).toBe("account_locked");
    // After the lock period it works again.
    expect(await code(verifyLogin(db, "owner@test.com", "correct-horse-battery", null, "ip", new Date(Date.now() + 16 * 60_000)))).toBe("ok");
    expect(await code(verifyLogin(db, "nobody@test.com", "x", null, "ip"))).toBe("invalid_credentials");
  });

  it("requires the authenticator code once two-factor sign-in is confirmed", async () => {
    const a = await createAdmin(db, "owner@test.com", "Owner", "correct-horse-battery");
    const actor = { type: "admin" as const, id: a.id, ip: "ip" };
    const { secret, url } = await startTotp(db, a.id);
    expect(url).toContain("otpauth://totp/");
    expect(await code(verifyLogin(db, "owner@test.com", "correct-horse-battery", null, "ip"))).toBe("ok"); // not active until confirmed
    expect(await code(confirmTotp(db, a.id, "123456", actor))).toBe("totp_invalid");
    const now = Date.now();
    await confirmTotp(db, a.id, totpAt(secret, currentStep(now)), actor);
    expect(await code(verifyLogin(db, "owner@test.com", "correct-horse-battery", null, "ip"))).toBe("totp_required");
    const next = totpAt(secret, currentStep(now) + 1);
    expect(await code(verifyLogin(db, "owner@test.com", "correct-horse-battery", next, "ip", new Date(now + 30_000)))).toBe("ok");
    expect(await code(verifyLogin(db, "owner@test.com", "correct-horse-battery", next, "ip", new Date(now + 30_000)))).toBe("totp_invalid"); // replay
  });

  it("administrators cannot disable themselves; new ones need strong passwords", async () => {
    const a = await createAdmin(db, "owner@test.com", "Owner", "correct-horse-battery");
    const actor = { type: "admin" as const, id: a.id, ip: "ip" };
    expect(await code(addAdmin(db, "staff@test.com", "Staff", "short", actor))).toBe("password_too_short");
    const b = await addAdmin(db, "staff@test.com", "Staff", "another-long-password", actor);
    expect(await code(addAdmin(db, "STAFF@test.com", "Staff", "another-long-password", actor))).toBe("email_taken");
    expect(await code(setAdminActive(db, a.id, false, actor))).toBe("cannot_disable_self");
    await setAdminActive(db, b.id, false, actor);
    expect(await code(verifyLogin(db, "staff@test.com", "another-long-password", null, "ip"))).toBe("invalid_credentials");
  });

  it("public menu paths can never shadow the platform's own routes", () => {
    for (const s of ["admin", "api", "media", "o", "r", "_next", "favicon.ico"]) expect(RESERVED_SLUGS.has(s)).toBe(true);
  });
});
