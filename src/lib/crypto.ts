import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "./env";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

/** URL-safe random token with `bytes` bytes of entropy (QR tokens 16 B = 128 bit, device tokens 32 B). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Human-typed codes (POS enrollment): no ambiguous characters, grouped "ABCD-EFGH-JKLM". */
export function randomCode(groups = 3, size = 4): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  for (let g = 0; g < groups; g++) {
    const bytes = randomBytes(size);
    out.push(Array.from(bytes, (b) => alphabet[b % alphabet.length]).join(""));
  }
  return out.join("-");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** scrypt password hash: "scrypt$N$r$p$salt$hash". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(actual, expected);
}

/** Short signed values (e.g. a tracking cookie): payload.signature with HMAC-SHA256 over APP_SECRET. */
export function sign(payload: string): string {
  const mac = createHmac("sha256", env.appSecret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function unsign(signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const payload = signed.slice(0, i);
  return safeEqual(sign(payload), signed) ? payload : null;
}
