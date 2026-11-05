// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseSellerProfitSettings } from './seller-profit-settings';

describe('parseSellerProfitSettings (doc 17 §8.1)', () => {
  it('stores amounts as kuruş strings and desi limits as numbers', () => {
    expect(
      parseSellerProfitSettings({
        fixedSaleFee: '12,50',
        desiBands: [
          { maxDesi: '4,5', cargo: '85,00', operation: '25' },
          { maxDesi: '10', cargo: '1.250,00', operation: '0' },
          { maxDesi: '', cargo: '150', operation: '40' },
        ],
      }),
    ).toEqual({
      fixedSaleFee: '1250',
      desiBands: [
        { maxDesi: 4.5, cargo: '8500', operation: '2500' },
        { maxDesi: 10, cargo: '125000', operation: '0' },
        { maxDesi: null, cargo: '15000', operation: '4000' },
      ],
    });
  });

  it.each([
    [
      'an unreadable fee',
      { fixedSaleFee: 'on iki', desiBands: [{ maxDesi: '', cargo: '1', operation: '1' }] },
      /Sabit satış bedeli/,
    ],
    ['an empty table', { fixedSaleFee: '12,50', desiBands: [] }, /en az bir satır/],
    [
      'a catch-all row in the middle',
      {
        fixedSaleFee: '12,50',
        desiBands: [
          { maxDesi: '', cargo: '1', operation: '1' },
          { maxDesi: '5', cargo: '1', operation: '1' },
        ],
      },
      /yalnızca son satırın/,
    ],
    [
      'limits that do not rise',
      {
        fixedSaleFee: '12,50',
        desiBands: [
          { maxDesi: '5', cargo: '1', operation: '1' },
          { maxDesi: '5', cargo: '1', operation: '1' },
        ],
      },
      /artmalı/,
    ],
    [
      'a desi of zero',
      { fixedSaleFee: '12,50', desiBands: [{ maxDesi: '0', cargo: '1', operation: '1' }] },
      /desi üst sınırı/,
    ],
    [
      'a missing cargo amount',
      { fixedSaleFee: '12,50', desiBands: [{ maxDesi: '', cargo: '', operation: '1' }] },
      /kargo/,
    ],
  ])('refuses %s', (_name, body, message) => {
    const result = parseSellerProfitSettings(body);
    expect(typeof result).toBe('string');
    expect(result as string).toMatch(message);
  });
});
