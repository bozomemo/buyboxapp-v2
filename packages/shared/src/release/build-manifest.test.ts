import { describe, expect, it } from 'vitest';
import { buildManifest, type BuiltComponent } from './build-manifest.js';
import { UpdateManifestSchema, type UpdateManifest } from './manifest.js';

const BASE = 'https://github.com/bozomemo/buybox-releases/releases/download/v0.2.1';
const OLD_BASE = 'https://github.com/bozomemo/buybox-releases/releases/download/v0.2.0';

const built: BuiltComponent[] = [
  { name: 'app', version: '0.2.1', sha256: 'a'.repeat(64), size: 30, fileName: 'app-0.2.1.zip' },
  { name: 'chromium', version: 'pw-1.49', sha256: 'c'.repeat(64), size: 290, fileName: 'chromium-pw-1.49.zip' },
];

const previous: UpdateManifest = {
  schema: 1,
  version: '0.2.0',
  releasedAt: '2026-11-01T00:00:00Z',
  notes: '',
  components: {
    app: { version: '0.2.0', sha256: 'f'.repeat(64), size: 29, url: `${OLD_BASE}/app-0.2.0.zip` },
    chromium: { version: 'pw-1.49', sha256: 'c'.repeat(64), size: 290, url: `${OLD_BASE}/chromium-pw-1.49.zip` },
  },
};

const input = (prev: UpdateManifest | undefined) => ({
  version: '0.2.1',
  releasedAt: '2026-11-10T12:00:00Z',
  notes: 'Notlar',
  releaseDownloadBaseUrl: BASE,
  built,
  previous: prev,
});

describe('buildManifest', () => {
  it('publishes every component as new when there is no previous release', () => {
    const { manifest, newAssets } = buildManifest(input(undefined));
    expect(newAssets).toEqual(['app-0.2.1.zip', 'chromium-pw-1.49.zip']);
    expect(manifest.components.app?.url).toBe(`${BASE}/app-0.2.1.zip`);
    expect(manifest.components.chromium?.url).toBe(`${BASE}/chromium-pw-1.49.zip`);
  });

  it('points an unchanged component at the release that first published it', () => {
    const { manifest, newAssets } = buildManifest(input(previous));
    expect(manifest.components.chromium?.url).toBe(`${OLD_BASE}/chromium-pw-1.49.zip`);
    expect(newAssets).not.toContain('chromium-pw-1.49.zip');
  });

  it('publishes a component whose hash changed under the new release', () => {
    const { manifest, newAssets } = buildManifest(input(previous));
    expect(manifest.components.app?.url).toBe(`${BASE}/app-0.2.1.zip`);
    expect(newAssets).toEqual(['app-0.2.1.zip']);
  });

  it('produces a manifest the schema accepts', () => {
    expect(UpdateManifestSchema.safeParse(buildManifest(input(previous)).manifest).success).toBe(true);
  });
});
