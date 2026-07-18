/**
 * RateLimiter — in-memory sliding-window rate limiter (Phase 7.4, Part 5).
 *
 * Protects backend endpoints from abuse and denial-of-service by limiting
 * the number of requests a client can make within a rolling window.
 *
 * The limiter is keyed by an identifier (typically the client IP, or a
 * custom API key header). It is intentionally simple and dependency-free;
 * for multi-instance deployments a shared store (Redis) would replace the
 * in-memory map.
 */

import { SecurityConfig } from "./SecurityConfig";
import type { RateLimitResult } from "./SecurityTypes";
import { createLogger } from "../utils/logger";

const logger = createLogger("RateLimiter");

interface Bucket {
  /** Timestamps (ms) of recent requests within the window. */
  hits: number[];
  /** Window start reference (for cleanup). */
  windowStart: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = SecurityConfig.rateLimitMax, windowSec = SecurityConfig.rateLimitWindowSec) {
    this.limit = limit;
    this.windowMs = windowSec * 1000;
  }

  /**
   * Check whether a request from `key` is allowed.
   * Records the hit if allowed.
   */
  check(key: string): RateLimitResult {
    const now = Date.now();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { hits: [], windowStart: now };
      this.buckets.set(key, bucket);
    }

    // Drop hits outside the current window.
    bucket.hits = bucket.hits.filter((t) => now - t < this.windowMs);

    const remaining = this.limit - bucket.hits.length;

    if (remaining <= 0) {
      const oldest = bucket.hits[0] ?? now;
      const resetSeconds = Math.ceil((this.windowMs - (now - oldest)) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetSeconds: Math.max(1, resetSeconds),
        limit: this.limit,
      };
    }

    bucket.hits.push(now);
    const oldest = bucket.hits[0];
    const resetSeconds = Math.ceil((this.windowMs - (now - oldest)) / 1000);

    return {
      allowed: true,
      remaining: this.limit - bucket.hits.length,
      resetSeconds: Math.max(1, resetSeconds),
      limit: this.limit,
    };
  }

  /**
   * Periodically evict idle buckets to avoid unbounded memory growth.
   * Call from a timer in the server startup if desired.
   */
  evictIdle(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart > this.windowMs * 2) {
        this.buckets.delete(key);
      }
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

let instance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!instance) instance = new RateLimiter();
  return instance;
}