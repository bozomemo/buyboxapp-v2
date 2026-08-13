/**
 * Money — exact currency arithmetic in minor units (kuruş).
 *
 * Hard rule (CLAUDE.md): money is `bigint` minor units everywhere — database, domain,
 * API, UI. Never a float, never a JS `number`, in any layer. Formatting to a locale
 * string is a display-boundary concern only (`format()`), never used internally.
 *
 * Rounding rule (docs/02-cost-and-price-model.md §"Rounding"): half-up to the nearest
 * kuruş, applied once, at the end of a calculation chain. `multiplyByFraction` is the
 * only operation that can produce a non-integer result, and it rounds exactly once.
 * Addition, subtraction and negation are exact bigint operations and introduce no
 * rounding at all.
 */

/** Divide two bigints, rounding half-up (half away from zero), as a single exact step. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new RangeError('Money: division by zero');
  }
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export class Money {
  private readonly kurus: bigint;

  private constructor(kurus: bigint) {
    this.kurus = kurus;
  }

  static readonly zero: Money = new Money(0n);

  /** Construct from an exact integer number of kuruş. */
  static fromKurus(kurus: bigint): Money {
    return new Money(kurus);
  }

  /**
   * Construct from a decimal major-unit string (e.g. "19.99" lira), exact — no float
   * ever touches the value. At most two fractional digits are accepted; anything more
   * is a caller error, not silently rounded, since major-unit input should already be
   * expressed in kuruş precision.
   */
  static fromMajorUnitsString(value: string): Money {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) {
      throw new RangeError(`Money: invalid decimal string "${value}"`);
    }
    const [, sign = '', whole = '', fraction = ''] = match;
    const paddedFraction = fraction.padEnd(2, '0');
    const kurus = BigInt(whole) * 100n + BigInt(paddedFraction);
    return new Money(sign === '-' ? -kurus : kurus);
  }

  /** The exact integer amount in kuruş. */
  toKurus(): bigint {
    return this.kurus;
  }

  add(other: Money): Money {
    return new Money(this.kurus + other.kurus);
  }

  subtract(other: Money): Money {
    return new Money(this.kurus - other.kurus);
  }

  negate(): Money {
    return new Money(-this.kurus);
  }

  abs(): Money {
    return this.kurus < 0n ? this.negate() : this;
  }

  /**
   * Multiply by an exact rational number (numerator / denominator) — the only place
   * rounding happens, and it happens once, half-up, at the end of this single step.
   * Use this for percentage rates (commission, VAT) expressed as exact fractions
   * (e.g. a rate of 19.5% as `numerator: 195n, denominator: 1000n`) so no precision is
   * lost before the final rounding.
   */
  multiplyByFraction(numerator: bigint, denominator: bigint): Money {
    return new Money(divideRoundHalfUp(this.kurus * numerator, denominator));
  }

  compareTo(other: Money): -1 | 0 | 1 {
    if (this.kurus < other.kurus) return -1;
    if (this.kurus > other.kurus) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.kurus === other.kurus;
  }

  isZero(): boolean {
    return this.kurus === 0n;
  }

  isNegative(): boolean {
    return this.kurus < 0n;
  }

  isPositive(): boolean {
    return this.kurus > 0n;
  }

  static min(a: Money, b: Money): Money {
    return a.compareTo(b) <= 0 ? a : b;
  }

  static max(a: Money, b: Money): Money {
    return a.compareTo(b) >= 0 ? a : b;
  }

  /**
   * Display-boundary formatting only — never use this output for further computation
   * or for anything sent over the wire. Turkish locale, two fractional digits.
   */
  format(locale = 'tr-TR', currency: string | undefined = 'TRY'): string {
    const major = Number(this.kurus) / 100;
    return new Intl.NumberFormat(locale, currency ? { style: 'currency', currency } : undefined).format(
      major,
    );
  }

  /** Culture-invariant wire serialisation: the exact kuruş amount as a decimal string. */
  toJSON(): string {
    return this.kurus.toString();
  }

  static fromJSON(value: string): Money {
    if (!/^-?\d+$/.test(value)) {
      throw new RangeError(`Money: invalid serialised value "${value}"`);
    }
    return new Money(BigInt(value));
  }

  toString(): string {
    return this.toJSON();
  }
}
