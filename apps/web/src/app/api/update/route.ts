/**
 * Self-update status for Settings > Güncelleme (docs/superpowers/specs/2026-11-04-auto-update-design.md §5.3).
 *
 * Reads the files the update check and the updater write; never touches the network. A read, so
 * `view` (R-AUTH-10) — checking and installing are the admin-only actions. Reachable while
 * unlicensed (proxy.ts) so an expired install can still be moved to a build that fixes it.
 */
import { NextResponse } from 'next/server';
import { isFreshFile, offerableReady, readJsonFile, updatePaths, UpdateStateSchema, UpdateStatusSchema } from '@buybox/jobs';
import { withPermission } from '@/lib/server/auth/guard';
import { updateConfig } from '@/lib/server/update';

export const dynamic = 'force-dynamic';

async function getHandler() {
  const config = updateConfig();
  if (!config) {
    return NextResponse.json({ available: false, currentVersion: process.env.APP_VERSION ?? null, state: null, status: null, inProgress: false });
  }
  const paths = updatePaths(config.dataDir);
  const state = readJsonFile(paths.state, UpdateStateSchema);
  const now = Date.now();
  return NextResponse.json({
    available: true,
    currentVersion: config.currentVersion,
    state: state ? { ...state, ready: offerableReady(state, config.currentVersion) } : null,
    status: readJsonFile(paths.status, UpdateStatusSchema) ?? null,
    // A lock or request left by a run that died is not an update in progress (UPDATE_STALE_MS).
    inProgress: isFreshFile(paths.lock, now) || isFreshFile(paths.request, now),
  });
}

export const GET = withPermission('view', getHandler);
