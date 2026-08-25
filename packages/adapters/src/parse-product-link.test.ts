import { describe, expect, it } from 'vitest';
import { parseProductLink } from './parse-product-link.js';

describe('parseProductLink', () => {
  const cases: { input: string; expected: ReturnType<typeof parseProductLink> }[] = [
    {
      input: 'https://www.trendyol.com/dyson/v12-p-757251065',
      expected: {
        marketplaceCode: 'trendyol',
        ref: { url: 'https://www.trendyol.com/dyson/v12-p-757251065', contentId: '757251065' },
      },
    },
    {
      input: 'https://www.trendyol.com/marka/urun-p-1149754544?merchantId=722974',
      expected: {
        marketplaceCode: 'trendyol',
        ref: {
          url: 'https://www.trendyol.com/marka/urun-p-1149754544?merchantId=722974',
          contentId: '1149754544',
        },
      },
    },
    {
      input: 'trendyol.com/x-p-1', // no scheme — still accepted
      expected: { marketplaceCode: 'trendyol', ref: { url: 'https://trendyol.com/x-p-1', contentId: '1' } },
    },
    {
      input: 'https://www.hepsiburada.com/a4tech-xl-750bh-oyun-p-BS1372',
      expected: {
        marketplaceCode: 'hepsiburada',
        ref: { url: 'https://www.hepsiburada.com/a4tech-xl-750bh-oyun-p-BS1372', contentId: 'BS1372' },
      },
    },
    // Not a product page at all — no `-p-{id}` segment.
    { input: 'https://www.trendyol.com/marka', expected: null },
    // A brand/category listing page some other TY path shape might resemble is still rejected
    // without a `-p-` id — display text alone is never enough to derive identity from.
    { input: 'https://www.trendyol.com/butun-urunler', expected: null },
    // Unrecognised host.
    { input: 'https://www.amazon.com/x-p-1', expected: null },
    { input: 'not a url at all', expected: null },
    { input: '', expected: null },
    { input: '   ', expected: null },
  ];

  for (const { input, expected } of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(parseProductLink(input)).toEqual(expected);
    });
  }
});
