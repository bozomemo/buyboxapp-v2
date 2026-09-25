import { describe, expect, it } from 'vitest';
import { MODULE_SETTING_KEYS, parseEnabledModules } from './modules.js';

describe('parseEnabledModules — absent means enabled, so an upgrade removes nothing', () => {
  it.each([
    ['no rows at all (every install before doc 17)', undefined, undefined, { seller: true, brand: true }],
    ['both explicitly on', 'true', 'true', { seller: true, brand: true }],
    ['brand-only', 'false', 'true', { seller: false, brand: true }],
    ['seller-only', 'true', 'false', { seller: true, brand: false }],
    ['brand-only with the brand row never written', 'false', undefined, { seller: false, brand: true }],
    ['garbage never disables a module', 'no', '0', { seller: true, brand: true }],
    ['both off is corrupt, not a choice — answered with both on', 'false', 'false', { seller: true, brand: true }],
  ])('%s', (_label, seller, brand, expected) => {
    expect(parseEnabledModules(seller, brand)).toEqual(expected);
  });
});

describe('MODULE_SETTING_KEYS', () => {
  it('uses the keys doc 05 records', () => {
    expect(MODULE_SETTING_KEYS).toEqual({ seller: 'modules.seller', brand: 'modules.brand' });
  });
});
