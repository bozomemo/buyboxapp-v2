/**
 * Turkish-locale formatting — display boundary only (R-UI-1, R-UI-11). Money stays `bigint`
 * kuruş everywhere upstream of this file; nothing here mutates or rounds a stored value.
 */
import { Money } from '@buybox/shared';

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

export function formatDate(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined) return '—';
  return DATE_FORMATTER.format(new Date(epochMs));
}
