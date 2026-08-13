import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  it('constructs an exact amount from kuruş', () => {
    expect(Money.fromKurus(1999n).toKurus()).toBe(1999n);
  });

  it('parses major-unit decimal strings exactly, no float involved', () => {
    expect(Money.fromMajorUnitsString('19.99').toKurus()).toBe(1999n);
    expect(Money.fromMajorUnitsString('19.9').toKurus()).toBe(1990n);
    expect(Money.fromMajorUnitsString('19').toKurus()).toBe(1900n);
    expect(Money.fromMajorUnitsString('-5.05').toKurus()).toBe(-505n);
  });

  it('rejects malformed decimal strings', () => {
    expect(() => Money.fromMajorUnitsString('19.999')).toThrow(RangeError);
    expect(() => Money.fromMajorUnitsString('abc')).toThrow(RangeError);
    expect(() => Money.fromMajorUnitsString('')).toThrow(RangeError);
  });

  it('addition and subtraction are exact bigint operations', () => {
    const a = Money.fromKurus(100n);
    const b = Money.fromKurus(37n);
    expect(a.add(b).toKurus()).toBe(137n);
    expect(a.subtract(b).toKurus()).toBe(63n);
    expect(b.subtract(a).toKurus()).toBe(-63n);
  });

  it('negate and abs', () => {
    const a = Money.fromKurus(50n);
    expect(a.negate().toKurus()).toBe(-50n);
    expect(a.negate().abs().toKurus()).toBe(50n);
  });

  describe('multiplyByFraction — rounds half-up exactly once', () => {
    it('rounds a clean half up', () => {
      // 101 kuruş * 1/2 = 50.5 -> 51
      expect(Money.fromKurus(101n).multiplyByFraction(1n, 2n).toKurus()).toBe(51n);
    });

    it('rounds below half down', () => {
      // 100 kuruş * 1/3 = 33.33... -> 33
      expect(Money.fromKurus(100n).multiplyByFraction(1n, 3n).toKurus()).toBe(33n);
    });

    it('rounds above half up', () => {
      // 100 kuruş * 2/3 = 66.66... -> 67
      expect(Money.fromKurus(100n).multiplyByFraction(2n, 3n).toKurus()).toBe(67n);
    });

    it('is exact for a whole-number result (no spurious rounding)', () => {
      expect(Money.fromKurus(300n).multiplyByFraction(1n, 3n).toKurus()).toBe(100n);
    });

    it('applies commission-style percentage rates exactly', () => {
      // 1000 kuruş at 19.5% commission = 195.00 -> 195
      expect(Money.fromKurus(1000n).multiplyByFraction(195n, 1000n).toKurus()).toBe(195n);
    });

    it('rounds half-up symmetrically for negative amounts', () => {
      expect(Money.fromKurus(-101n).multiplyByFraction(1n, 2n).toKurus()).toBe(-51n);
    });

    it('throws on division by zero', () => {
      expect(() => Money.fromKurus(100n).multiplyByFraction(1n, 0n)).toThrow(RangeError);
    });
  });

  it('compares and orders', () => {
    const small = Money.fromKurus(100n);
    const large = Money.fromKurus(200n);
    expect(small.compareTo(large)).toBe(-1);
    expect(large.compareTo(small)).toBe(1);
    expect(small.compareTo(small)).toBe(0);
    expect(Money.min(small, large)).toBe(small);
    expect(Money.max(small, large)).toBe(large);
  });

  it('equals, isZero, isNegative, isPositive', () => {
    expect(Money.fromKurus(5n).equals(Money.fromKurus(5n))).toBe(true);
    expect(Money.zero.isZero()).toBe(true);
    expect(Money.fromKurus(-1n).isNegative()).toBe(true);
    expect(Money.fromKurus(1n).isPositive()).toBe(true);
  });

  it('round-trips through JSON serialisation without float', () => {
    const original = Money.fromKurus(123456789012345n);
    const json = original.toJSON();
    expect(json).toBe('123456789012345');
    expect(Money.fromJSON(json).equals(original)).toBe(true);
  });

  it('rejects invalid serialised values', () => {
    expect(() => Money.fromJSON('12.5')).toThrow(RangeError);
    expect(() => Money.fromJSON('abc')).toThrow(RangeError);
  });

  it('formats at the display boundary only, Turkish locale', () => {
    const formatted = Money.fromKurus(1999n).format();
    // Exact glyphs vary by ICU data; assert on the numerically meaningful parts only.
    expect(formatted).toContain('19,99');
  });
});
