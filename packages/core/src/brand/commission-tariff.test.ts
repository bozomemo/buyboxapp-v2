import { describe, expect, it } from 'vitest';
import { buildCommissionTiers, parseTariffPeriod, tariffProductKey } from './commission-tariff.js';

const NOV_2_2026 = Date.UTC(2026, 10, 2, 9, 0);

describe('parseTariffPeriod — Türkiye time, end minute inclusive, year inferred', () => {
  it('reads the sample workbook period', () => {
    expect(parseTariffPeriod('1 Kasım 08.00-5 Kasım 07.59', NOV_2_2026)).toEqual({
      validFrom: Date.UTC(2026, 10, 1, 5, 0),
      validUntil: Date.UTC(2026, 10, 5, 5, 0),
    });
  });

  it.each([
    ['1 kasim 08:00 - 5 KASIM 07:59', Date.UTC(2026, 10, 1, 5, 0)],
    ['1 Kasım 08.00–5 Kasım 07.59', Date.UTC(2026, 10, 1, 5, 0)],
  ])('tolerates spelling, colon and dash variants: %s', (text, validFrom) => {
    expect(parseTariffPeriod(text, NOV_2_2026)?.validFrom).toBe(validFrom);
  });

  it('crosses the year when it ends in January', () => {
    expect(parseTariffPeriod('30 Aralık 08.00-3 Ocak 07.59', Date.UTC(2026, 11, 29))).toEqual({
      validFrom: Date.UTC(2026, 11, 30, 5, 0),
      validUntil: Date.UTC(2027, 0, 3, 5, 0),
    });
  });

  it('picks the year that puts the start nearest the import, even across new year', () => {
    expect(parseTariffPeriod('30 Aralık 08.00-3 Ocak 07.59', Date.UTC(2027, 0, 2))?.validFrom).toBe(
      Date.UTC(2026, 11, 30, 5, 0),
    );
  });

  it('accepts 29 Şubat in a leap year', () => {
    expect(parseTariffPeriod('29 Şubat 08.00-3 Mart 07.59', Date.UTC(2028, 1, 20))?.validFrom).toBe(
      Date.UTC(2028, 1, 29, 5, 0),
    );
  });

  it.each([
    '',
    'Tarih aralığı',
    '1 Mars 08.00-5 Mars 07.59',
    '31 Şubat 08.00-3 Mart 07.59',
    '1 Kasım 25.00-5 Kasım 07.59',
  ])('refuses %j', (text) => {
    expect(parseTariffPeriod(text, NOV_2_2026)).toBeNull();
  });
});

describe('tariffProductKey — the folded key a tariff and a brand product meet on', () => {
  it.each([
    ['064992714512', '64992714512'],
    ['64992714512', '64992714512'],
    [' 064992714512 ', '64992714512'],
    ['TYBX3YONHM41DQ1W03', 'TYBX3YONHM41DQ1W03'],
    ['tybx3yonhm41dq1w03', 'TYBX3YONHM41DQ1W03'],
    ['0', '0'],
    ['', null],
    [null, null],
  ])('%j -> %j', (code, key) => {
    expect(tariffProductKey(code)).toBe(key);
  });
});

describe('buildCommissionTiers', () => {
  const limits = {
    tier1Min: 426660n,
    tier2Max: 426659n,
    tier2Min: 361360n,
    tier3Max: 361359n,
    tier3Min: 313565n,
    tier4Max: 313564n,
  };

  it('orders the bands highest price first', () => {
    const built = buildCommissionTiers(limits, [16.5, 6.2, 2.8, 2.7]);
    expect(built.ok && built.tiers.map((tier) => tier.rate)).toEqual([16.5, 6.2, 2.8, 2.7]);
  });

  it('refuses limits that do not descend', () => {
    expect(buildCommissionTiers({ ...limits, tier3Min: 400000n }, [16.5, 6.2, 2.8, 2.7])).toEqual({
      ok: false,
      problem: 'limitsOutOfOrder',
    });
  });

  it('refuses a rate outside 0–100', () => {
    expect(buildCommissionTiers(limits, [116.5, 6.2, 2.8, 2.7])).toEqual({
      ok: false,
      problem: 'rateOutOfRange',
    });
  });
});
