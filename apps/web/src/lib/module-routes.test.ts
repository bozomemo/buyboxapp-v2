import { describe, expect, it } from 'vitest';
import { moduleForPath } from './module-routes';

describe('moduleForPath', () => {
  it.each([
    ['/', null],
    ['/jobs', null],
    ['/settings/marketplaces', null],
    ['/settings/modules', null],
    ['/api/modules', null],
    ['/api/dashboard', null],
    ['/stock', 'seller'],
    ['/listings/abc', 'seller'],
    ['/brands', 'seller'],
    ['/competitors/sellers', 'seller'],
    // One seller's page is linked from the brand module's seller rows and findings (doc 17 §1.3).
    ['/competitors/sellers/trendyol/1', null],
    ['/competitors/sellers/hepsiburada/abc-1', null],
    ['/settings/fees', 'seller'],
    ['/api/listings/bulk', 'seller'],
    ['/api/kill-switch/marketplace', 'seller'],
    ['/api/competitors/sellers', 'seller'],
    // Shared by both modules' seller screens, although its parent is the seller's.
    ['/api/competitors/sellers/identity', null],
    ['/api/competitors/sellers/group', null],
    ['/api/competitors/sellers/trendyol/1', null],
    ['/api/competitors', 'seller'],
    ['/api/competitors/listings', 'seller'],
    ['/watched-brands/findings', 'brand'],
    ['/tracked-products/1', 'brand'],
    ['/brand/products', 'brand'],
    ['/api/brand-reports/findings', 'brand'],
    ['/api/seller-policies/import', 'brand'],
  ])('%s → %s', (path, expected) => {
    expect(moduleForPath(path)).toBe(expected);
  });

  it('a wildcard matches exactly one non-empty segment', () => {
    expect(moduleForPath('/competitors/sellers/trendyol')).toBe('seller');
    expect(moduleForPath('/competitors/sellers//1')).toBe('seller');
  });

  it('never files the seller’s /brands under the brand module’s /brand', () => {
    expect(moduleForPath('/brands')).toBe('seller');
    expect(moduleForPath('/brandsomething')).toBeNull();
  });
});
