/**
 * Fixed-window rate limiting. Uses Upstash Redis (REST) when configured so
 * limits hold across serverless instances; falls back to process memory.
 */
import { env } from "./env";
import { log } from "./log";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000));
  const bucket = `rl:${key}:${windowStart}`;
  const resetAt = (windowStart + 1) * windowSeconds * 1000;
  let count: number;
  if (env.upstashUrl && env.upstashToken) {
    try {
      const res = await fetch(`${env.upstashUrl}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.upstashToken}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", bucket],
          ["EXPIRE", bucket, String(windowSeconds + 5)],
        ]),
      });
      const data = (await res.json()) as Array<{ result: number }>;
      count = Number(data[0]?.result ?? 0);
    } catch (e) {
      // Fail open on limiter outage, but log it: availability over strictness here.
      log.warn("rate limiter unavailable", { error: String(e) });
      return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    }
  } else {
    const entry = memory.get(bucket);
    if (!entry) {
      memory.set(bucket, { count: 1, resetAt });
      count = 1;
      if (memory.size > 10000) for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
    } else {
      count = ++entry.count;
    }
  }
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

export function resetRateLimits() {
  memory.clear();
}
