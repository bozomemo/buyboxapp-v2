/**
 * The window the tracked-products screen reads its period figures over — the price band and,
 * since 2026-11-08, the seller filters and the _Satıcı_ count (spec
 * `docs/superpowers/specs/2026-11-08-tracked-products-filters-design.md` §4.3).
 *
 * Shared by the list route and the seller dropdown's route so the dropdown never offers a seller
 * the filter would then not find.
 */

/**
 * How far back the window looks when the caller does not say (`?periodDays=`).
 *
 * Thirty days because that is the span the audit asks about — "bu ay kim ne fiyata sattı" — and
 * because the deep scrape runs daily, so it is thirty looks rather than thirty rows.
 */
export const DEFAULT_PERIOD_DAYS = 30;

export function periodWindowFrom(
  params: URLSearchParams,
  nowMs: number = Date.now(),
): { periodDays: number; sinceMs: number; untilMs: number } {
  const raw = params.get('periodDays');
  const parsed = raw === null || raw.trim() === '' ? NaN : Math.trunc(Number(raw));
  const periodDays = Math.max(1, Number.isFinite(parsed) ? parsed : DEFAULT_PERIOD_DAYS);
  return { periodDays, sinceMs: nowMs - periodDays * 24 * 60 * 60 * 1000, untilMs: nowMs };
}
