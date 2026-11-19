// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FeesPayloadError, feesPayloadToRow } from './to-row';

/**
 * The last cargo band must be open-ended (product owner, 2026-11-19). With only "≤ 150 ₺" a
 * 170 ₺ price matched no band and the engine used the last band's amount anyway, so the floor
 * rested on a cargo cost the operator never stated for that price.
 */
const payload = (cargoBands: { maxPrice: string | null; amount: string }[]) => ({
  defaultCommissionRate: 15,
  cargoBands,
  expenditureBands: [{ minPrice: '0', amount: '0' }],
});

describe('feesPayloadToRow cargo bands', () => {
  it('accepts an open-ended last band', () => {
    const row = feesPayloadToRow(
      payload([
        { maxPrice: '150', amount: '39,99' },
        { maxPrice: null, amount: '25' },
      ]),
      'trendyol',
      0,
    );
    expect(JSON.parse(row.cargoBands)).toHaveLength(2);
  });

  it('treats an empty upper bound as open-ended', () => {
    expect(() => feesPayloadToRow(payload([{ maxPrice: '', amount: '25' }]), 'trendyol', 0)).not.toThrow();
  });

  it('refuses bands whose last one has an upper bound', () => {
    expect(() => feesPayloadToRow(payload([{ maxPrice: '150', amount: '39,99' }]), 'trendyol', 0)).toThrow(
      new FeesPayloadError('Son kargo bandının üst sınırı boş olmalı: bu sınırın üstündeki fiyatların kargosu da tanımlı olmalı.'),
    );
  });

  it('refuses no cargo band at all', () => {
    expect(() => feesPayloadToRow(payload([]), 'trendyol', 0)).toThrow(FeesPayloadError);
  });

  it('refuses an open-ended band that is not the last', () => {
    expect(() =>
      feesPayloadToRow(
        payload([
          { maxPrice: null, amount: '25' },
          { maxPrice: '150', amount: '39,99' },
        ]),
        'trendyol',
        0,
      ),
    ).toThrow(FeesPayloadError);
  });
});
