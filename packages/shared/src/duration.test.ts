import { describe, expect, it } from 'vitest';
import { Duration } from './duration.js';

describe('Duration', () => {
  it('converts units to milliseconds', () => {
    expect(Duration.toMillis(Duration.millis(500))).toBe(500);
    expect(Duration.toMillis(Duration.seconds(2))).toBe(2000);
    expect(Duration.toMillis(Duration.minutes(1))).toBe(60_000);
    expect(Duration.toMillis(Duration.hours(1))).toBe(3_600_000);
    expect(Duration.toMillis(Duration.days(1))).toBe(86_400_000);
  });

  it('converts to seconds', () => {
    expect(Duration.toSeconds(Duration.millis(1500))).toBe(1.5);
  });

  it('adds durations', () => {
    const total = Duration.add(Duration.seconds(30), Duration.minutes(1));
    expect(Duration.toMillis(total)).toBe(90_000);
  });

  it('compares durations', () => {
    expect(Duration.compare(Duration.seconds(1), Duration.seconds(2))).toBe(-1);
    expect(Duration.compare(Duration.seconds(2), Duration.seconds(1))).toBe(1);
    expect(Duration.compare(Duration.seconds(1), Duration.seconds(1))).toBe(0);
  });

  it('rejects negative or non-finite values', () => {
    expect(() => Duration.millis(-1)).toThrow(RangeError);
    expect(() => Duration.millis(Number.NaN)).toThrow(RangeError);
    expect(() => Duration.millis(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('zero is zero', () => {
    expect(Duration.toMillis(Duration.zero)).toBe(0);
  });
});
