import { MARKETPLACE_LABELS } from './labels';

/**
 * The fields of `/api/dashboard` the header's scan-freshness pill reads (spec 2026-11-03-ui-redesign
 * §5.3). Declared structurally here rather than imported from `dashboard-client.tsx`, so the shell
 * does not depend on a screen.
 */
export interface DashboardFreshnessInput {
  /** Absent from a server older than doc 17 — read as both enabled, as the dashboard does. */
  modules?: { seller: boolean; brand: boolean };
  brandAudit: { brands: { marketplaceCode: string; lastSweptAt: number | null }[] } | null;
  competitorAlerts?: {
    coverage: { marketplaceCode: string; displayName: string; lastOkAt: number | null; stale: boolean }[];
  } | null;
}

export interface Freshness {
  marketplaceCode: string;
  label: string;
  at: number | null;
  tone: 'ok' | 'warn' | 'neutral';
}

/**
 * One entry per marketplace: when it was last scanned, and whether that is late.
 *
 * - **Brand**: the latest `lastSweptAt` across that marketplace's brands, tone `ok` — or `neutral`
 *   when no brand there was ever swept, since green would vouch for a scan that never ran. The
 *   brand payload carries no staleness flag, and inventing a threshold here would be a business
 *   rule decided in a header pill.
 * - **Seller**: `coverage`, with tone `warn` when the server already judged it `stale`.
 * - A marketplace on both sides shows the seller entry, the only one with a staleness judgement.
 */
export function scanFreshness(payload: DashboardFreshnessInput): Freshness[] {
  const seller = payload.modules?.seller ?? true;
  const brand = payload.modules?.brand ?? true;
  const byCode = new Map<string, Freshness>();

  if (brand && payload.brandAudit) {
    for (const { marketplaceCode, lastSweptAt } of payload.brandAudit.brands) {
      const prev = byCode.get(marketplaceCode);
      const at = prev?.at == null ? lastSweptAt : lastSweptAt == null ? prev.at : Math.max(prev.at, lastSweptAt);
      byCode.set(marketplaceCode, {
        marketplaceCode,
        label: MARKETPLACE_LABELS[marketplaceCode] ?? marketplaceCode,
        at,
        tone: at === null ? 'neutral' : 'ok',
      });
    }
  }

  if (seller && payload.competitorAlerts) {
    for (const c of payload.competitorAlerts.coverage) {
      byCode.set(c.marketplaceCode, {
        marketplaceCode: c.marketplaceCode,
        label: c.displayName,
        at: c.lastOkAt,
        tone: c.stale ? 'warn' : 'ok',
      });
    }
  }

  return [...byCode.values()];
}
