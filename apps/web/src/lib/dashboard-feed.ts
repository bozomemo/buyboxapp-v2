import { useSyncExternalStore } from 'react';
import type { DashboardFreshnessInput } from './scan-freshness';

/**
 * The Panel's last good read of `/api/dashboard`, shared with the header's scan pill. On `/` both
 * read that route, and it is the dashboard's whole payload: the Panel publishes each read here
 * and the pill takes it instead of fetching a second copy. Module state, not context — the Panel
 * renders inside the shell's `children`, below any provider the pill could read from.
 */
let latest: DashboardFreshnessInput | undefined;
const listeners = new Set<() => void>();

export function publishDashboardFreshness(data: DashboardFreshnessInput): void {
  latest = data;
  for (const listener of listeners) listener();
}

export function readDashboardFreshness(): DashboardFreshnessInput | undefined {
  return latest;
}

/** For tests: one case's published read must not become the next case's pill. */
export function resetDashboardFeed(): void {
  latest = undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDashboardFreshness(): DashboardFreshnessInput | undefined {
  return useSyncExternalStore(subscribe, readDashboardFreshness, () => undefined);
}
