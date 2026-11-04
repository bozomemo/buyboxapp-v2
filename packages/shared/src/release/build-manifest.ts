/**
 * Builds a release's `update.json` from the components `installer/release.ps1` produced
 * (docs/superpowers/specs/2026-11-04-auto-update-design.md §4.5). Vendor side only.
 */
import { COMPONENT_NAMES, type ComponentName, type UpdateManifest } from './manifest.js';

export interface BuiltComponent {
  readonly name: ComponentName;
  /** The component's cache key — the release version for `app`. */
  readonly version: string;
  readonly sha256: string;
  readonly size: number;
  readonly fileName: string;
}

export interface BuildManifestInput {
  readonly version: string;
  readonly releasedAt: string;
  readonly notes: string;
  /** `https://github.com/<repo>/releases/download/v<version>`, no trailing slash. */
  readonly releaseDownloadBaseUrl: string;
  readonly built: readonly BuiltComponent[];
  /** The currently published manifest, or `undefined` for the first release. */
  readonly previous: UpdateManifest | undefined;
}

/**
 * A component whose hash the previous release already published keeps that release's URL, so a
 * 700 MB Chromium archive is uploaded once rather than with every release. Everything else is
 * listed in `newAssets` and must be uploaded with this release.
 */
export function buildManifest(input: BuildManifestInput): {
  manifest: UpdateManifest;
  newAssets: string[];
} {
  const components: UpdateManifest['components'] = {};
  const newAssets: string[] = [];
  const byName = new Map(input.built.map((component) => [component.name, component]));

  for (const name of COMPONENT_NAMES) {
    const component = byName.get(name);
    if (!component) continue;
    const published = input.previous?.components[name];
    const reuse = published !== undefined && published.sha256 === component.sha256;
    if (!reuse) newAssets.push(component.fileName);
    components[name] = {
      version: component.version,
      sha256: component.sha256,
      size: component.size,
      url: reuse ? published.url : `${input.releaseDownloadBaseUrl}/${component.fileName}`,
    };
  }

  return {
    manifest: {
      schema: 1,
      version: input.version,
      releasedAt: input.releasedAt,
      notes: input.notes,
      components,
    },
    newAssets,
  };
}
