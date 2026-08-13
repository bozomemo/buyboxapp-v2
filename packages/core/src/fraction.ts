/**
 * Fraction — exact rational arithmetic over bigint, used internally by the pricing
 * formulas (docs/02-cost-and-price-model.md §5) so that a chain of additions, VAT
 * factors and percentage rates never rounds an intermediate value. Rounding rule
 * (doc 02 §1): "half-up to the nearest kuruş, applied once, at the end of a calculation
 * chain. Never round intermediate values." `Money` itself cannot represent a
 * non-integer kuruş amount, so every formula computes in `Fraction` and converts to
 * `Money` exactly once, at its final step.
 *
 * Design note: rates and ratios (VAT %, commission %, campaign ratio) are plain
 * `number` per doc 02 §1 ("Rates and multipliers ... are number, since they are not
 * money"). Converting a `number` to an exact `Fraction` requires picking a precision;
 * `PERCENT_SCALE` below fixes it at six decimal digits of a percentage point
 * (0.0000001), far finer than any real commission, VAT or campaign figure, so this
 * conversion is exact for every value this system will ever see in practice.
 */
import { Money } from '@buybox/shared';

export interface Fraction {
  readonly num: bigint;
  readonly den: bigint; // always > 0
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x === 0n ? 1n : x;
}

function reduce(num: bigint, den: bigint): Fraction {
  if (den === 0n) {
    throw new RangeError('Fraction: zero denominator');
  }
  let n = num;
  let d = den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

/** Ceiling division for den > 0, correct for either sign of numerator. */
function ceilDiv(num: bigint, den: bigint): bigint {
  const q = num / den;
  const r = num % den;
  return r > 0n ? q + 1n : q;
}

/** Round-half-up division for den > 0, symmetric around zero. */
function roundHalfUpDiv(num: bigint, den: bigint): bigint {
  const negative = num < 0n;
  const n = negative ? -num : num;
  const q = n / den;
  const r = n % den;
  const rounded = r * 2n >= den ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** Percent precision: 1e-6 of a percentage point (see module doc comment). */
const PERCENT_SCALE = 1_000_000n;
const NUMBER_SCALE = 1_000_000_000n;

export const Fraction = {
  zero: { num: 0n, den: 1n } as Fraction,
  one: { num: 1n, den: 1n } as Fraction,

  of(num: bigint, den = 1n): Fraction {
    return reduce(num, den);
  },

  fromMoney(money: Money): Fraction {
    return reduce(money.toKurus(), 1n);
  },

  /** `percent` as a fraction of 100, e.g. `fromPercent(19.2)` = 19.2/100. */
  fromPercent(percent: number): Fraction {
    const scaled = BigInt(Math.round(percent * Number(PERCENT_SCALE)));
    return reduce(scaled, 100n * PERCENT_SCALE);
  },

  /** A plain ratio (not a percentage), e.g. a campaign ratio of 0.87. */
  fromNumber(value: number): Fraction {
    const scaled = BigInt(Math.round(value * Number(NUMBER_SCALE)));
    return reduce(scaled, NUMBER_SCALE);
  },

  add(a: Fraction, b: Fraction): Fraction {
    return reduce(a.num * b.den + b.num * a.den, a.den * b.den);
  },

  sub(a: Fraction, b: Fraction): Fraction {
    return reduce(a.num * b.den - b.num * a.den, a.den * b.den);
  },

  mul(a: Fraction, b: Fraction): Fraction {
    return reduce(a.num * b.num, a.den * b.den);
  },

  div(a: Fraction, b: Fraction): Fraction {
    if (b.num === 0n) {
      throw new RangeError('Fraction: division by zero');
    }
    return reduce(a.num * b.den, a.den * b.num);
  },

  isPositive(a: Fraction): boolean {
    return a.num > 0n;
  },

  isZero(a: Fraction): boolean {
    return a.num === 0n;
  },

  /** -1 if a < b, 0 if equal, 1 if a > b. */
  compare(a: Fraction, b: Fraction): -1 | 0 | 1 {
    const left = a.num * b.den;
    const right = b.num * a.den;
    return left < right ? -1 : left > right ? 1 : 0;
  },

  max(a: Fraction, b: Fraction): Fraction {
    return Fraction.compare(a, b) >= 0 ? a : b;
  },

  /** The single, final rounding step for a fee/proceeds calculation chain. */
  toMoneyRoundHalfUp(a: Fraction): Money {
    return Money.fromKurus(roundHalfUpDiv(a.num, a.den));
  },

  /** The single, final rounding step for a floor-price calculation chain (never under). */
  toMoneyRoundUp(a: Fraction): Money {
    return Money.fromKurus(ceilDiv(a.num, a.den));
  },
};
