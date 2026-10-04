import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  it('allows up to capacity within the window, then denies with a retry hint', () => {
    // 2 tokens, refilling at 1 per 1000ms — mirrors Trendyol's "N per window" shape.
    const limiter = new RateLimiter({ read: { capacity: 2, refillPerMs: 1 / 1000 } });

    expect(limiter.tryAcquire('read', 0)).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(limiter.tryAcquire('read', 0)).toEqual({ allowed: true, retryAfterMs: 0 });

    const denied = limiter.tryAcquire('read', 0);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('refills over time, driven entirely by the `nowMs` argument (fake clock)', () => {
    const limiter = new RateLimiter({ read: { capacity: 1, refillPerMs: 1 / 1000 } });

    expect(limiter.tryAcquire('read', 0).allowed).toBe(true);
    expect(limiter.tryAcquire('read', 100).allowed).toBe(false);
    expect(limiter.tryAcquire('read', 1000).allowed).toBe(true);
  });

  it('keeps independent buckets per key', () => {
    const limiter = new RateLimiter({
      productRead: { capacity: 1, refillPerMs: 0 },
      inventoryWrite: { capacity: 1, refillPerMs: 0 },
    });

    expect(limiter.tryAcquire('productRead', 0).allowed).toBe(true);
    expect(limiter.tryAcquire('productRead', 0).allowed).toBe(false);
    // The other bucket is untouched.
    expect(limiter.tryAcquire('inventoryWrite', 0).allowed).toBe(true);
  });

  it('reconfigure settles earned tokens at the old rate, then clamps to the new capacity', () => {
    const limiter = new RateLimiter({ read: { capacity: 5, refillPerMs: 1 / 1000 } });
    for (let i = 0; i < 5; i += 1) expect(limiter.tryAcquire('read', 0).allowed).toBe(true);

    // 3 s at the old rate earns 3 tokens; the new capacity of 1 keeps only one of them.
    limiter.reconfigure('read', { capacity: 1, refillPerMs: 1 / 10_000 }, 3000);
    expect(limiter.tryAcquire('read', 3000).allowed).toBe(true);
    expect(limiter.tryAcquire('read', 3000).allowed).toBe(false);
    // The new, slower rate applies from here on.
    expect(limiter.tryAcquire('read', 4000).allowed).toBe(false);
    expect(limiter.tryAcquire('read', 13_000).allowed).toBe(true);
  });

  it('reconfigure before any acquire just changes the config', () => {
    const limiter = new RateLimiter({ read: { capacity: 5, refillPerMs: 0 } });
    limiter.reconfigure('read', { capacity: 1, refillPerMs: 0 }, 0);
    expect(limiter.tryAcquire('read', 0).allowed).toBe(true);
    expect(limiter.tryAcquire('read', 0).allowed).toBe(false);
  });

  it('throws when reconfiguring an unconfigured bucket key', () => {
    const limiter = new RateLimiter({});
    expect(() => limiter.reconfigure('unknown', { capacity: 1, refillPerMs: 0 }, 0)).toThrow(
      /unknown bucket/i,
    );
  });

  it('throws for an unconfigured bucket key', () => {
    const limiter = new RateLimiter({});
    expect(() => limiter.tryAcquire('unknown', 0)).toThrow(/unknown bucket/i);
  });
});
