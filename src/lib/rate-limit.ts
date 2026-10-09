/**
 * Token-bucket rate limiting in process memory (one Next.js instance per deployment, see docs/DEPLOYMENT.md).
 * For several instances, put the same limits at the reverse proxy or swap this for a shared store.
 */
type Bucket = { tokens: number; at: number };
const g = globalThis as unknown as { __rl?: Map<string, Bucket> };
const buckets = (g.__rl ??= new Map());

export function rateLimit(key: string, capacity: number, refillPerMinute: number, nowMs = Date.now()): boolean {
  const b = buckets.get(key) ?? { tokens: capacity, at: nowMs };
  b.tokens = Math.min(capacity, b.tokens + ((nowMs - b.at) / 60_000) * refillPerMinute);
  b.at = nowMs;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (nowMs - v.at > 600_000) buckets.delete(k);
  }
  return true;
}

export function resetRateLimits() {
  buckets.clear();
}
