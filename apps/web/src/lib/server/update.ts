/**
 * The web half of self-update (docs/superpowers/specs/2026-11-04-auto-update-design.md §5.3).
 *
 * The web process never installs anything. "Şimdi kur" writes `request.json` and starts the
 * `BuyBoxUpdater` scheduled task, which runs `apply-update.ps1` as SYSTEM — the service cannot
 * replace its own files while it is running them.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveUpdateConfig, type UpdateConfig } from '@buybox/jobs';

/** `undefined` on a developer checkout, which has no install directory to update. */
export function updateConfig(): UpdateConfig | undefined {
  return resolveUpdateConfig(process.env);
}

const execFileAsync = promisify(execFile);

async function startScheduledTask(): Promise<void> {
  try {
    await execFileAsync('schtasks', ['/run', '/tn', 'BuyBoxUpdater'], { windowsHide: true, timeout: 30_000 });
  } catch (error) {
    const detail = (error as { stderr?: string }).stderr?.trim() || (error instanceof Error ? error.message : String(error));
    throw new Error(`Güncelleme görevi (BuyBoxUpdater) başlatılamadı: ${detail}`);
  }
}

let runner: () => Promise<void> = startScheduledTask;

export function runUpdaterTask(): Promise<void> {
  return runner();
}

/** Tests only: replaces `schtasks`; `undefined` restores it. */
export function setUpdaterTaskRunnerForTests(replacement: (() => Promise<void>) | undefined): void {
  runner = replacement ?? startScheduledTask;
}
