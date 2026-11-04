import { describe, expect, it } from 'vitest';
import { DEFAULT_MANIFEST_URL, resolveUpdateConfig } from './update-config.js';

const installed = { BUYBOX_DATA_DIR: 'C:\\ProgramData\\BuyBox', BUYBOX_INSTALL_DIR: 'C:\\Program Files\\BuyBox', APP_VERSION: '0.2.0' };

describe('resolveUpdateConfig', () => {
  it('is undefined on a developer checkout, which has no install directory', () => {
    expect(resolveUpdateConfig({ BUYBOX_DATA_DIR: 'x', APP_VERSION: '0.2.0' })).toBeUndefined();
    expect(resolveUpdateConfig({ BUYBOX_INSTALL_DIR: 'x', APP_VERSION: '0.2.0' })).toBeUndefined();
    expect(resolveUpdateConfig({ ...installed, APP_VERSION: undefined })).toBeUndefined();
  });

  it('defaults to the public releases repository every six hours', () => {
    expect(resolveUpdateConfig(installed)).toEqual({
      dataDir: installed.BUYBOX_DATA_DIR,
      installDir: installed.BUYBOX_INSTALL_DIR,
      currentVersion: '0.2.0',
      manifestUrl: DEFAULT_MANIFEST_URL,
      intervalMs: 6 * 3_600_000,
    });
    expect(DEFAULT_MANIFEST_URL).toBe('https://github.com/bozomemo/buybox-releases/releases/latest/download/update.json');
  });

  it('keeps an empty UPDATE_MANIFEST_URL, which disables checking', () => {
    expect(resolveUpdateConfig({ ...installed, UPDATE_MANIFEST_URL: '' })?.manifestUrl).toBe('');
  });

  it.each([
    ['30m', 30 * 60_000],
    ['12h', 12 * 3_600_000],
    ['5m', 15 * 60_000],
    ['soon', 6 * 3_600_000],
  ])('reads UPDATE_CHECK_INTERVAL=%s as %d ms (never under 15 minutes)', (value, expected) => {
    expect(resolveUpdateConfig({ ...installed, UPDATE_CHECK_INTERVAL: value })?.intervalMs).toBe(expected);
  });
});
