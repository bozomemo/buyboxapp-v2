/**
 * Turkish-locale formatting — display boundary only (R-UI-1, R-UI-11). Money stays `bigint`
 * kuruş everywhere upstream of this file; nothing here mutates or rounds a stored value.
 */
import { Money } from '@buybox/shared';
import { isOperatorDecimal, toWireDecimal } from './operator-money';

const CURRENCY_FORMATTER = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER_FORMATTER = new Intl.NumberFormat('tr-TR');

const PERCENT_FORMATTER = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short' });

const TIME_FORMATTER = new Intl.DateTimeFormat('tr-TR', { timeStyle: 'medium' });

/** `bigint` kuruş → "₺123,45". */
export function formatMoney(kurus: bigint | null | undefined): string {
  if (kurus === null || kurus === undefined) return '—';
  return CURRENCY_FORMATTER.format(Number(kurus) / 100);
}

/** For a `Money` value from `packages/shared`. */
export function formatMoneyValue(money: Money | null | undefined): string {
  if (!money) return '—';
  return formatMoney(money.toKurus());
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return NUMBER_FORMATTER.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `%${PERCENT_FORMATTER.format(value)}`;
}

export function formatDateTime(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined) return '—';
  return DATE_TIME_FORMATTER.format(new Date(epochMs));
}

/** Time only — for a live log where every line is from the last few minutes and the date is noise. */
export function formatTime(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined) return '—';
  return TIME_FORMATTER.format(new Date(epochMs));
}

/**
 * Elapsed/remaining duration in ms → "12sn" / "3dk 04sn" / "5sa 20dk" / "2g 6sa".
 *
 * Only the two largest non-zero units are shown. This spans job durations (seconds) and
 * buybox-held or alert-quiet windows (days) from one function on purpose: the same value
 * rendered as "2880dk 00sn" is technically correct and unreadable, and an operator scanning a
 * screen for "is this stale" should not have to divide.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}sn`;

  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}dk ${String(totalSeconds % 60).padStart(2, '0')}sn`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}sa ${String(minutes % 60).padStart(2, '0')}dk`;

  const days = Math.floor(hours / 24);
  return `${days}g ${String(hours % 24).padStart(2, '0')}sa`;
}

/**
 * `bigint` kuruş → plain major units for a CSV export: `4990` becomes `49.90`, with no currency
 * symbol and no thousands separator. Divided as `bigint`, never through `Number(kurus) / 100` —
 * an export is data, and money never routes through a float. Accepts the wire's decimal string
 * as well. Empty for an unknown amount: a spreadsheet cannot tell `0.00` from "we do not know".
 */
export function kurusToDecimal(kurus: bigint | string | null | undefined): string {
  if (kurus === null || kurus === undefined || kurus === '') return '';
  const value = BigInt(kurus);
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const minor = (magnitude % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${magnitude / 100n}.${minor}`;
}

/**
 * Operator-typed Turkish lira → `bigint` kuruş, or `null` when the text is not a price.
 *
 * The inverse of {@link formatMoney}. It reads exactly what every money field reads
 * (`toWireDecimal`, product owner 2026-11-19: one TL reading app-wide) — "1.400" is 1 400 ₺,
 * "400,50" and "400.50" are 400,50 ₺ — and never goes through a float. Negative amounts are
 * not prices here.
 */
export function parseMoneyToKurus(input: string): bigint | null {
  if (!isOperatorDecimal(input)) return null;
  const wire = toWireDecimal(input);
  if (wire.startsWith('-')) return null;
  const [whole = '0', fraction = ''] = wire.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function formatDate(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined) return '—';
  return DATE_FORMATTER.format(new Date(epochMs));
}
