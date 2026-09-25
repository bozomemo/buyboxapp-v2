/**
 * Page size and offset from a query string, clamped to what a screen can ask for.
 *
 * `Math.min(requested, max)` alone let a negative through, and `LIMIT -1` is *no limit* to SQLite:
 * `/api/tracked-products?limit=-1` returned all 8,217 rows, 8.5 MB, in one response (measured
 * 2026-09-25). A size below one or anything unreadable is the default; above the ceiling is the
 * ceiling.
 */
export function pageLimit(raw: string | null, fallback: number, max: number): number {
  const parsed = raw === null || raw.trim() === '' ? NaN : Math.trunc(Number(raw));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function pageOffset(raw: string | null): number {
  const parsed = raw === null || raw.trim() === '' ? NaN : Math.trunc(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
