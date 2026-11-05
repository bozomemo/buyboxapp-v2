/**
 * A desi as typed — `4,5`, `4.5`, `12` — into a number (doc 17 §8).
 *
 * Desi is a volumetric weight, not money, so a `number` is the right type (doc 02 §1). It is read
 * strictly anyway: one separator, at most two decimals, greater than zero and at most
 * `DESI_MAX`. A value that is anything else is refused rather than rounded, because a desi read
 * wrongly picks the wrong cargo band without any sign of it.
 */
export const DESI_MAX = 10_000;

export function parseDesi(raw: string | null | undefined): number | null | 'invalid' {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(text)) return 'invalid';
  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > DESI_MAX) return 'invalid';
  return value;
}

/** A desi for display and for the edit form: Turkish decimal comma, no trailing zeros. */
export function formatDesi(value: number | null): string {
  if (value === null) return '';
  return String(value).replace('.', ',');
}
