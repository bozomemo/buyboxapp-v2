/**
 * Where and how often to look for updates (docs/superpowers/specs/2026-11-04-auto-update-design.md §10).
 *
 * Both directories come from the service definition (BuyBoxApp.xml.template). A developer
 * checkout sets neither, and gets no update checks at all rather than checks against a layout
 * that does not exist.
 */
export const DEFAULT_MANIFEST_URL =
  'https://github.com/bozomemo/buybox-releases/releases/latest/download/update.json';

const DEFAULT_INTERVAL_MS = 6 * 3_600_000;
/** Checking a static file more often than this only adds vendor traffic. */
const MIN_INTERVAL_MS = 15 * 60_000;

export interface UpdateConfig {
  readonly dataDir: string;
  readonly installDir: string;
  readonly currentVersion: string;
  /** Empty means checking is disabled. */
  readonly manifestUrl: string;
  readonly intervalMs: number;
}

function parseInterval(value: string | undefined): number {
  const match = /^(\d+)(m|h)$/.exec(value?.trim() ?? '');
  if (!match) return DEFAULT_INTERVAL_MS;
  const ms = Number(match[1]) * (match[2] === 'h' ? 3_600_000 : 60_000);
  return Math.max(ms, MIN_INTERVAL_MS);
}

export function resolveUpdateConfig(env: Record<string, string | undefined>): UpdateConfig | undefined {
  const dataDir = env.BUYBOX_DATA_DIR;
  const installDir = env.BUYBOX_INSTALL_DIR;
  const currentVersion = env.APP_VERSION;
  if (!dataDir || !installDir || !currentVersion) return undefined;
  return {
    dataDir,
    installDir,
    currentVersion,
    manifestUrl: env.UPDATE_MANIFEST_URL ?? DEFAULT_MANIFEST_URL,
    intervalMs: parseInterval(env.UPDATE_CHECK_INTERVAL),
  };
}
