// Ported from the ston3gpt build (2026-09-02).
//
// Two Express middlewares, applied globally in main.ts:
//   securityHeaders — defensive response headers on every reply
//   rateLimit       — per-instance, per-IP request cap
//
// The rate limiter is PER PROCESS, held in memory. It is a blunt abuse guard
// for a single instance, not a distributed quota — running more than one
// replica multiplies the effective allowance by the replica count.
//
// DIVERGENCE from ston3gpt: that version never evicts expired buckets, so the
// Map grows by one entry per unique client IP and is never reclaimed. Added a
// sweep (see maybeSweep) to bound it.

import type { NextFunction, Request, Response } from "express";

type RateBucket = { count: number; resetAt: number };
const buckets = new Map<string, RateBucket>();
let lastSweepAt = 0;

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Drop buckets whose window has already closed. Runs at most once per window
// so the common path stays O(1); an expired bucket is harmless until then
// because the count is reset on next use anyway.
function maybeSweep(now: number, windowMs: number) {
  if (now - lastSweepAt < windowMs) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  // Health probes must never be throttled — a rate-limited readiness check
  // would report the process unhealthy under load, which is backwards.
  if (req.path === "/health" || req.path.startsWith("/health/")) return next();

  const now = Date.now();
  const windowMs = positiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
  const maxRequests = positiveInt(process.env.RATE_LIMIT_MAX, 120);
  maybeSweep(now, windowMs);

  const key = req.ip || req.socket.remoteAddress || "unknown";
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  buckets.set(key, bucket);

  res.setHeader("RateLimit-Limit", maxRequests);
  res.setHeader("RateLimit-Remaining", Math.max(0, maxRequests - bucket.count));
  res.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

  if (bucket.count > maxRequests) {
    res.setHeader("Retry-After", Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).json({ statusCode: 429, message: "Too many requests" });
    return;
  }
  next();
}

export function resetRateLimitState() {
  buckets.clear();
  lastSweepAt = 0;
}

// Test-only visibility into the bucket map so the sweep can be asserted.
export function rateLimitBucketCount() {
  return buckets.size;
}
