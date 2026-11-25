import { describe, expect, it } from 'vitest';
import { marketplaceProductUrl } from './product-url';

describe('marketplaceProductUrl', () => {
  it.each([
    ['absolute link is left alone', 'trendyol', 'https://www.trendyol.com/m/u-p-1', 'https://www.trendyol.com/m/u-p-1'],
    ['relative Trendyol path gains its origin', 'trendyol', '/marka/urun-p-757251065', 'https://www.trendyol.com/marka/urun-p-757251065'],
    ['relative Hepsiburada path gains its own origin', 'hepsiburada', '/a4tech-oyun-p-BS1372', 'https://www.hepsiburada.com/a4tech-oyun-p-BS1372'],
    ['a path with no leading slash still joins cleanly', 'trendyol', 'marka/urun-p-1', 'https://www.trendyol.com/marka/urun-p-1'],
    ['surrounding whitespace is trimmed', 'trendyol', '  /urun-p-1  ', 'https://www.trendyol.com/urun-p-1'],
    ['an unknown marketplace yields no link', 'amazon', '/urun-p-1', null],
    ['an empty stored value yields no link', 'trendyol', '', null],
    ['a missing stored value yields no link', 'trendyol', null, null],
    ['the seller pin is dropped, the rest of the query kept', 'trendyol', '/m/u-p-1?boutiqueId=61&merchantId=107493', 'https://www.trendyol.com/m/u-p-1?boutiqueId=61'],
    ['a lone seller pin leaves no dangling question mark', 'trendyol', 'https://www.trendyol.com/m/u-p-1?merchantId=5', 'https://www.trendyol.com/m/u-p-1'],
  ])('%s', (_name, code, stored, expected) => {
    expect(marketplaceProductUrl(code, stored)).toBe(expected);
  });
});
