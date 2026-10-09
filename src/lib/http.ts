import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { env } from "./env";
import { log } from "./log";

export function clientIp(req: Request): string {
  if (env.trustProxy) {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real;
  }
  return "local";
}

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Runs a route handler: AppError → its status and code; validation errors → 400; anything else is logged → 500. */
export async function handle(req: Request, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.code, ...e.details }, e.status);
    if (e instanceof ZodError) return json({ error: "invalid_request", issues: e.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    if (e instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
    log.error("http.unhandled", { path: new URL(req.url).pathname, error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
    return json({ error: "server_error" }, 500);
  }
}

/** JSON body with a size cap (protects the server from oversized payloads). */
export async function readJson(req: Request, maxBytes = 256 * 1024): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new AppError("payload_too_large", 413);
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("payload_too_large", 413);
  return JSON.parse(text);
}

/** Browser-originated mutations must come from our own origin (CSRF defence for cookie-authenticated routes). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (no cookies are trusted from them anyway)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host || new URL(origin).host !== host) throw new AppError("bad_origin", 403);
}
