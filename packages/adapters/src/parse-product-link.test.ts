import { describe, expect, it } from 'vitest';
import {
  hepsiburadaParentRef,
  parseProductLink,
  parseProductLinkForMarketplace,
} from './parse-product-link.js';

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
    // The host-less path this app's own screens show (2026-09-25).
    {
      input: '/orijen/acana-kitten-yavru-kedi-mamasi-1-8kg-p-1092756157?boutiqueId=61&merchantId=1114093',
      expected: {
        marketplaceCode: 'trendyol',
        ref: {
          url: 'https://www.trendyol.com/orijen/acana-kitten-yavru-kedi-mamasi-1-8kg-p-1092756157?boutiqueId=61&merchantId=1114093',
          contentId: '1092756157',
        },
      },
    },
    {
      input: '/orijen-kitten-p-HBCV00002GD91J',
      expected: {
        marketplaceCode: 'hepsiburada',
        ref: { url: 'https://www.hepsiburada.com/orijen-kitten-p-HBCV00002GD91J', contentId: 'HBCV00002GD91J' },
      },
    },
    // A host-less path whose id is neither numeric nor an HB SKU names no marketplace.
    { input: '/bir-sey-p-XYZ1', expected: null },
    { input: '/orijen-kitten-pm-HBC00002GD91I', expected: null },
  ];

  for (const { input, expected } of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(parseProductLink(input)).toEqual(expected);
    });
  }
});

describe('parseProductLinkForMarketplace', () => {
  /** The form our own sweep stores — 7,308 of the live install's 7,309 rows (api-references §1.6). */
  it('reads the relative path this app itself stores, query string and all', () => {
    expect(
      parseProductLinkForMarketplace(
        '/royal-canin/kitten-yavru-kedi-mamasi-2-kg-p-750104?boutiqueId=61&merchantId=107493',
        'trendyol',
      ),
    ).toMatchObject({ ok: true, contentId: '750104' });
  });

  it('reads an absolute link with or without www', () => {
    expect(
      parseProductLinkForMarketplace('https://www.trendyol.com/marka/urun-p-757251065', 'trendyol'),
    ).toMatchObject({ ok: true, contentId: '757251065' });
    expect(parseProductLinkForMarketplace('trendyol.com/marka/urun-p-1', 'trendyol')).toMatchObject({
      ok: true,
      contentId: '1',
    });
  });

  it('reads a Hepsiburada SKU link', () => {
    expect(
      parseProductLinkForMarketplace(
        'https://www.hepsiburada.com/a4tech-xl-750bh-oyun-p-BS1372',
        'hepsiburada',
      ),
    ).toMatchObject({ ok: true, contentId: 'BS1372' });
  });

  /** A copy-paste slip with its own message, not a generic "link tanınamadı" (doc 17 §3.2). */
  it('calls a link in the other marketplace’s column exactly that', () => {
    expect(parseProductLinkForMarketplace('https://www.hepsiburada.com/urun-p-BS1372', 'trendyol')).toEqual({
      ok: false,
      problem: 'wrongMarketplace',
    });
    expect(parseProductLinkForMarketplace('https://www.trendyol.com/marka/urun-p-1', 'hepsiburada')).toEqual({
      ok: false,
      problem: 'wrongMarketplace',
    });
  });

  /**
   * `-pm-` is the parent product, not the variant that is sold (api-references §2.13). Guessing a
   * variant would attach the manager's PSF to the wrong pack size.
   */
  it('refuses a Hepsiburada parent-product link instead of guessing a variant', () => {
    expect(
      parseProductLinkForMarketplace('https://www.hepsiburada.com/bir-urun-pm-HBCV00001XXXXX', 'hepsiburada'),
    ).toEqual({ ok: false, problem: 'parentProduct', parentRef: 'HBCV00001XXXXX' });
  });

  it('names the parent of a -pm- link, absolute or host-less, and nothing else', () => {
    expect(hepsiburadaParentRef('https://www.hepsiburada.com/x-pm-HBC00002GD91I')).toBe('HBC00002GD91I');
    expect(
      hepsiburadaParentRef('/orijen-kitten-yavru-kedi-mamasi-1-8-kg-karisik-tat-ile-saglikli-beslenme-pm-HBC00002GD91I'),
    ).toBe('HBC00002GD91I');
    expect(hepsiburadaParentRef('https://www.hepsiburada.com/x-p-HBCV00002GD91J')).toBeNull();
    expect(hepsiburadaParentRef('https://www.trendyol.com/x-p-1')).toBeNull();
    expect(hepsiburadaParentRef('')).toBeNull();
  });

  it('separates an empty cell from an unreadable one', () => {
    expect(parseProductLinkForMarketplace('   ', 'trendyol')).toEqual({ ok: false, problem: 'empty' });
    expect(parseProductLinkForMarketplace('https://example.com/urun/5', 'trendyol')).toEqual({
      ok: false,
      problem: 'unrecognised',
    });
    // The right host, but nothing that identifies a product on it.
    expect(parseProductLinkForMarketplace('https://www.trendyol.com/sr?q=mama', 'trendyol')).toEqual({
      ok: false,
      problem: 'unrecognised',
    });
  });

  it('refuses a Trendyol link whose id is not numeric', () => {
    expect(parseProductLinkForMarketplace('https://www.trendyol.com/m/u-p-ABC', 'trendyol')).toEqual({
      ok: false,
      problem: 'unrecognised',
    });
  });
});
