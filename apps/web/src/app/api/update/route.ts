/**
 * Self-update status for Settings > Güncelleme (docs/superpowers/specs/2026-11-04-auto-update-design.md §5.3).
 *
 * Reads the files the update check and the updater write; never touches the network. A read, so
 * `view` (R-AUTH-10) — checking and installing are the admin-only actions. Reachable while
 * unlicensed (proxy.ts) so an expired install can still be moved to a build that fixes it.
 */
import { existsSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { readJsonFile, updatePaths, UpdateStateSchema, UpdateStatusSchema } from '@buybox/jobs';
import { withPermission } from '@/lib/server/auth/guard';
import { updateConfig } from '@/lib/server/update';

export const dynamic = 'force-dynamic';

async function getHandler() {
  const config = updateConfig();
  if (!config) {
    return NextResponse.json({ available: false, currentVersion: process.env.APP_VERSION ?? null, state: null, status: null, inProgress: false });
  }
  const paths = updatePaths(config.dataDir);
  return NextResponse.json({
    available: true,
    currentVersion: config.currentVersion,
    state: readJsonFile(paths.state, UpdateStateSchema) ?? null,
    status: readJsonFile(paths.status, UpdateStatusSchema) ?? null,
    inProgress: existsSync(paths.lock) || existsSync(paths.request),
  });
}

export const GET = withPermission('view', getHandler);
