import { describe, expect, it } from 'vitest';
import { scanFreshness, type DashboardFreshnessInput } from './scan-freshness';

const brand = (...sweeps: [string, number | null][]): DashboardFreshnessInput['brandAudit'] => ({
  brands: sweeps.map(([marketplaceCode, lastSweptAt]) => ({ marketplaceCode, lastSweptAt })),
});

describe('scanFreshness', () => {
  it.each<[string, DashboardFreshnessInput, ReturnType<typeof scanFreshness>]>([
    [
      'brand-only: two brands on one marketplace collapse to the latest sweep',
      { modules: { seller: false, brand: true }, brandAudit: brand(['trendyol', 1000], ['trendyol', 3000]) },
      [{ marketplaceCode: 'trendyol', label: 'Trendyol', at: 3000, tone: 'ok' }],
    ],
    [
      'never swept',
      { modules: { seller: false, brand: true }, brandAudit: brand(['trendyol', null], ['trendyol', null]) },
      [{ marketplaceCode: 'trendyol', label: 'Trendyol', at: null, tone: 'neutral' }],
    ],
    [
      'seller stale',
      {
        modules: { seller: true, brand: false },
        brandAudit: null,
        competitorAlerts: {
          coverage: [{ marketplaceCode: 'hepsiburada', displayName: 'Hepsiburada', lastOkAt: 500, stale: true }],
        },
      },
      [{ marketplaceCode: 'hepsiburada', label: 'Hepsiburada', at: 500, tone: 'warn' }],
    ],
    ['nothing to say', { brandAudit: null }, []],
    [
      'both modules, same marketplace: the seller entry wins',
      {
        modules: { seller: true, brand: true },
        brandAudit: brand(['trendyol', 9000]),
        competitorAlerts: {
          coverage: [{ marketplaceCode: 'trendyol', displayName: 'Trendyol', lastOkAt: 100, stale: false }],
        },
      },
      [{ marketplaceCode: 'trendyol', label: 'Trendyol', at: 100, tone: 'ok' }],
    ],
    [
      'seller module off: its coverage is not shown',
      {
        modules: { seller: false, brand: true },
        brandAudit: brand(['trendyol', 9000]),
        competitorAlerts: {
          coverage: [{ marketplaceCode: 'hepsiburada', displayName: 'Hepsiburada', lastOkAt: 100, stale: true }],
        },
      },
      [{ marketplaceCode: 'trendyol', label: 'Trendyol', at: 9000, tone: 'ok' }],
    ],
  ])('%s', (_, input, expected) => {
    expect(scanFreshness(input)).toEqual(expected);
  });
});
