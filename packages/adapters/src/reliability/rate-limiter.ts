/**
 * A token-bucket rate limiter keyed by an arbitrary string — each adapter defines its own keys,
 * one per API domain / service group (doc 10 §3: "Hepsiburada needs three independent limiters
 * ... Trendyol one per service group").
 *
 * Deliberately pure: every call takes `nowMs` explicitly rather than reading a clock, so it is
 * unit-testable with a fake clock (doc 12 Phase 4.2) without fake timers or real waiting.
 */

export interface TokenBucketConfig {
  /** Maximum tokens the bucket can hold (the burst allowance). */
  readonly capacity: number;
  /** Tokens regenerated per millisecond, e.g. 50 requests / 10_000 ms → 0.005. */
  readonly refillPerMs: number;
}

export interface AcquireResult {
  readonly allowed: boolean;
  /** 0 when allowed; otherwise how long the caller must wait before retrying. */
  readonly retryAfterMs: number;
}

interface BucketState {
  tokens: number;
  updatedAtMs: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, BucketState>();

  constructor(private readonly configs: Readonly<Record<string, TokenBucketConfig>>) {}

  /** Attempts to take one token from `key`'s bucket as of `nowMs`. Does not sleep or retry. */
  tryAcquire(key: string, nowMs: number): AcquireResult {
    const config = this.configs[key];
    if (!config) {
      throw new RangeError(`RateLimiter: unknown bucket "${key}"`);
    }
    const previous = this.buckets.get(key) ?? { tokens: config.capacity, updatedAtMs: nowMs };
    const elapsedMs = Math.max(0, nowMs - previous.updatedAtMs);
    const refilled = Math.min(config.capacity, previous.tokens + elapsedMs * config.refillPerMs);

    if (refilled >= 1) {
      this.buckets.set(key, { tokens: refilled - 1, updatedAtMs: nowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    this.buckets.set(key, { tokens: refilled, updatedAtMs: nowMs });
    const deficit = 1 - refilled;
    return { allowed: false, retryAfterMs: Math.ceil(deficit / config.refillPerMs) };
  }
}
