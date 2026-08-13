/**
 * A text encoding of `bigint` that sorts lexicographically in numeric order, including
 * negative numbers. SQLite has no native 64-bit-safe integer type Drizzle can map
 * exactly to `bigint` (its built-in `blob({mode:'bigint'})` stores an un-padded decimal
 * string, which does not sort correctly — `"10"` < `"9"` as bytes). This is used for
 * every money (kuruş) column on SQLite; PostgreSQL and MySQL use their native 64-bit
 * `bigint` column type instead (see `schema/postgres.ts`, `schema/mysql.ts`).
 *
 * Encoding: a sign digit (`1` = non-negative, `0` = negative — so negatives sort first,
 * correctly) followed by a zero-padded `WIDTH`-digit magnitude. Negative magnitudes are
 * stored ones-complemented (`OFFSET - abs(value)`) so a more-negative value produces a
 * *smaller* padded string and sorts first. `WIDTH = 20` covers magnitudes past 10^20 —
 * far beyond any realistic kuruş amount (int64's own range tops out at ~9.2×10^18).
 */
const WIDTH = 20;
const OFFSET = 10n ** BigInt(WIDTH) - 1n;
const MAX_MAGNITUDE = 10n ** BigInt(WIDTH) - 1n;

export function encodeSortableBigint(value: bigint): string {
  const magnitude = value < 0n ? -value : value;
  if (magnitude > MAX_MAGNITUDE) {
    throw new RangeError(`encodeSortableBigint: magnitude exceeds ${WIDTH} digits: ${value}`);
  }
  if (value >= 0n) {
    return `1${value.toString().padStart(WIDTH, '0')}`;
  }
  const complement = OFFSET - magnitude;
  return `0${complement.toString().padStart(WIDTH, '0')}`;
}

export function decodeSortableBigint(text: string): bigint {
  if (!/^[01]\d{20}$/.test(text)) {
    throw new RangeError(`decodeSortableBigint: malformed value "${text}"`);
  }
  const sign = text.charAt(0);
  const digits = text.slice(1);
  if (sign === '1') {
    return BigInt(digits);
  }
  const complement = BigInt(digits);
  return -(OFFSET - complement);
}
