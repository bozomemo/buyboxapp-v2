import { describe, expect, it, vi } from 'vitest';
import { computeBackoffMs, retryAsync } from './retry.js';

describe('computeBackoffMs', () => {
  it('is zero before the first retry and grows exponentially, capped at maxDelayMs', () => {
    const config = { maxAttempts: 5, baseMs: 100, factor: 2, maxDelayMs: 1000 };
    expect(computeBackoffMs(1, config)).toBe(0);
    expect(computeBackoffMs(2, config)).toBe(100);
    expect(computeBackoffMs(3, config)).toBe(200);
    expect(computeBackoffMs(4, config)).toBe(400);
    expect(computeBackoffMs(5, config)).toBe(800);
    expect(computeBackoffMs(6, config)).toBe(1000); // capped, would be 1600
  });
});

describe('retryAsync', () => {
  it('returns the first successful result without retrying', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await retryAsync(fn, {
      maxAttempts: 3,
      baseMs: 10,
      factor: 2,
      maxDelayMs: 1000,
      isRetryable: () => true,
      sleep,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries retryable failures up to maxAttempts, sleeping between attempts (fake sleep, no real waiting)', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok');

    const result = await retryAsync(fn, {
      maxAttempts: 3,
      baseMs: 10,
      factor: 2,
      maxDelayMs: 1000,
      isRetryable: () => true,
      sleep,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxAttempts and throws the last error', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retryAsync(fn, {
        maxAttempts: 3,
        baseMs: 10,
        factor: 2,
        maxDelayMs: 1000,
        isRetryable: () => true,
        sleep,
      }),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retryable error', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error('permanent (e.g. OutOfPriceRange)'));

    await expect(
      retryAsync(fn, {
        maxAttempts: 3,
        baseMs: 10,
        factor: 2,
        maxDelayMs: 1000,
        isRetryable: () => false,
        sleep,
      }),
    ).rejects.toThrow('permanent');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
