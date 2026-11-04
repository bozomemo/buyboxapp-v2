/**
 * "Şimdi kur" (docs/superpowers/specs/2026-11-04-auto-update-design.md §5.3). Never silent: this
 * route, behind an admin's click, is the only thing that starts an installation.
 *
 * It installs nothing itself. It records who asked for which version in `request.json` and starts
 * the `BuyBoxUpdater` scheduled task; `apply-update.ps1` re-verifies everything before it acts,
 * so this route's checks are about refusing a request that cannot be right, not about trust.
 */
import { existsSync, rmSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { readJsonFile, updatePaths, UpdateStateSchema, writeJsonFileAtomic, type UpdateRequest } from '@buybox/jobs';
import { readJsonObject } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import { runUpdaterTask, updateConfig } from '@/lib/server/update';

export const dynamic = 'force-dynamic';

const conflict = (error: string) => NextResponse.json({ error }, { status: 409 });

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const raw = await readJsonObject(request);
  if (raw === null || typeof raw.version !== 'string' || raw.version === '') {
    return NextResponse.json({ error: '`version` gerekli.' }, { status: 400 });
  }
  const config = updateConfig();
  if (!config) return conflict('Bu kurulumda otomatik güncelleme yok.');

  const paths = updatePaths(config.dataDir);
  // A second click while the first is still being picked up, or while an update runs, must not
  // start the task again.
  if (existsSync(paths.lock) || existsSync(paths.request)) return conflict('Bir güncelleme zaten sürüyor.');
  const ready = readJsonFile(paths.state, UpdateStateSchema)?.ready;
  if (!ready) return conflict('Kurulmaya hazır bir sürüm yok.');
  if (ready.version !== raw.version) {
    return conflict(`Hazır olan sürüm ${ready.version}, istenen ${raw.version}. Sayfayı yenileyin.`);
  }

  const body: UpdateRequest = { version: ready.version, requestedBy: auth.actor, requestedAt: new Date().toISOString() };
  writeJsonFileAtomic(paths.request, body);
  try {
    await runUpdaterTask();
  } catch (error) {
    rmSync(paths.request, { force: true });
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
  return NextResponse.json({ started: true }, { status: 202 });
}

export const POST = withPermission('settings.manage', postHandler);
