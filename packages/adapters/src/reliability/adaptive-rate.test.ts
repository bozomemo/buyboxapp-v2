import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_RATE_DEFAULTS,
  AdaptiveRateController,
  parseRetryAfterMs,
  type AdaptiveRateConfig,
} from './adaptive-rate.js';

const MIN = 60_000;

function controller(overrides: Partial<AdaptiveRateConfig> = {}): AdaptiveRateController {
  return new AdaptiveRateController({ ...ADAPTIVE_RATE_DEFAULTS, ceilingPerMinute: 30, ...overrides });
}

describe('AdaptiveRateController (doc 07 §7.7)', () => {
  it('starts at the ceiling, unpaused', () => {
    const rate = controller();
    expect(rate.ratePerMinute).toBe(30);
    expect(rate.isReduced).toBe(false);
    expect(rate.pauseRemainingMs(0)).toBe(0);
  });

  it.each([
    // [ceiling, floor, throttles one cooldown apart, expected rate after each]
    [30, 3, [15, 8, 4, 3, 3]],
    [12, 3, [6, 3, 3]],
    [10, 5, [5, 5]],
    [2, 3, [2]], // floor clamped to the ceiling: nothing to lower
  ] as const)('halves %d/min towards floor %d on each throttle: %j', (ceiling, floor, expected) => {
    const rate = controller({ ceilingPerMinute: ceiling, floorPerMinute: floor });
    expected.forEach((want, i) => {
      rate.onThrottled(i * MIN);
      expect(rate.ratePerMinute).toBe(want);
    });
  });

  it('reports a decrease with its pause, and nothing when the rate cannot move', () => {
    const rate = controller({ ceilingPerMinute: 4, floorPerMinute: 3 });
    expect(rate.onThrottled(0)).toEqual({
      direction: 'decrease',
      fromPerMinute: 4,
      toPerMinute: 3,
      ceilingPerMinute: 4,
      pauseMs: 60_000,
    });
    expect(rate.onThrottled(MIN)).toBeUndefined();
    // Still pauses, even though the rate is already at the floor.
    expect(rate.pauseRemainingMs(MIN)).toBe(60_000);
  });

  it('counts a burst of throttles inside the cooldown as one decrease', () => {
    // Three pages in flight hit by one throttling episode.
    const rate = controller();
    expect(rate.onThrottled(0)?.toPerMinute).toBe(15);
    expect(rate.onThrottled(1_000)).toBeUndefined();
    expect(rate.onThrottled(2_000)).toBeUndefined();
    expect(rate.ratePerMinute).toBe(15);
    // …but a pause re-armed by the later ones runs from the latest.
    expect(rate.pauseRemainingMs(2_000)).toBe(60_000);
    expect(rate.onThrottled(61_000)?.toPerMinute).toBe(8);
  });

  it.each([
    ['no Retry-After', undefined, 60_000],
    ['a Retry-After of 20 s', 20_000, 20_000],
    ['a Retry-After beyond the cap', 3_600_000, 600_000],
    ['a zero Retry-After', 0, 60_000],
  ] as const)('pauses for the right time with %s', (_label, retryAfterMs, expectedPause) => {
    const rate = controller();
    rate.onThrottled(1_000, retryAfterMs);
    expect(rate.pauseRemainingMs(1_000)).toBe(expectedPause);
    expect(rate.pauseRemainingMs(1_000 + expectedPause)).toBe(0);
  });

  it('never shortens a pause that is already running', () => {
    const rate = controller();
    rate.onThrottled(0, 120_000);
    rate.onThrottled(1_000, 5_000);
    expect(rate.pauseRemainingMs(1_000)).toBe(119_000);
  });

  it('steps up by one per quiet interval, back to the ceiling and no further', () => {
    const rate = controller({ ceilingPerMinute: 10, floorPerMinute: 3 });
    rate.onThrottled(0); // 10 → 5
    expect(rate.onAnswered(3 * MIN - 1)).toBeUndefined();
    expect(rate.onAnswered(3 * MIN)).toEqual({
      direction: 'increase',
      fromPerMinute: 5,
      toPerMinute: 6,
      ceilingPerMinute: 10,
      pauseMs: 0,
    });
    // The interval restarts at the step, not at the throttle.
    expect(rate.onAnswered(5 * MIN)).toBeUndefined();
    let t = 6 * MIN;
    for (const want of [7, 8, 9, 10]) {
      expect(rate.onAnswered(t)?.toPerMinute).toBe(want);
      t += 3 * MIN;
    }
    expect(rate.isReduced).toBe(false);
    expect(rate.onAnswered(t + 60 * MIN)).toBeUndefined();
    expect(rate.ratePerMinute).toBe(10);
  });

  it('restarts the quiet interval on a throttle inside the cooldown', () => {
    const rate = controller();
    rate.onThrottled(0); // 30 → 15
    rate.onThrottled(50_000); // inside cooldown: no halving, but no longer quiet
    expect(rate.onAnswered(3 * MIN)).toBeUndefined();
    expect(rate.onAnswered(50_000 + 3 * MIN)?.toPerMinute).toBe(16);
  });

  it('does nothing on an answer while at the ceiling', () => {
    const rate = controller();
    expect(rate.onAnswered(10 * MIN)).toBeUndefined();
    expect(rate.ratePerMinute).toBe(30);
  });

  it.each([0, 1, 1.5])('rejects a decrease factor of %d', (decreaseFactor) => {
    expect(() => controller({ decreaseFactor })).toThrow(RangeError);
  });

  it('rejects a non-positive ceiling', () => {
    expect(() => controller({ ceilingPerMinute: 0 })).toThrow(RangeError);
  });
});

describe('parseRetryAfterMs (RFC 9110 §10.2.3)', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  it.each([
    [null, undefined],
    [undefined, undefined],
    ['', undefined],
    ['  ', undefined],
    ['120', 120_000],
    [' 5 ', 5_000],
    ['0', 0],
    ['Sun, 04 Oct 2026 12:00:30 GMT', 30_000],
    ['Sun, 04 Oct 2026 11:59:00 GMT', 0], // already past
    ['-5', undefined],
    ['soon', undefined],
  ] as const)('%j → %j', (header, expected) => {
    expect(parseRetryAfterMs(header, now)).toBe(expected);
  });
});
