/**
 * Restarts the embedded worker in place (doc 06 §7.3, doc 07 §8.1).
 *
 * Job cadences and the scraper rate limit are resolved once at worker boot and fixed for that
 * worker's lifetime — deliberately, so a saved value can never change what is firing mid-run.
 * Applying one therefore needs a restart, and on a customer machine the only route to that was
 * `Restart-Service BuyBoxApp` from an elevated PowerShell prompt. This is that action as a
 * button.
 *
 * It restarts the *worker*, not the `BuyBoxApp` service: the web half and the worker share one
 * process (doc 14 §3, `SINGLE_PROCESS=1`), so stopping the service would drop the very
 * connection this response travels on and leave the operator staring at a dead tab with no way
 * to tell whether it came back. See `restartWorker` for the rest of the reasoning.
 *
 * No authentication check, consistent with every other route here: the service binds
 * `127.0.0.1` and the installer opens no firewall rule (doc 14 §4.4).
 */
import { NextResponse } from 'next/server';
import { getWorkerStatus, restartWorker } from '@/lib/server/worker-status';

export async function POST() {
  // Nothing to restart: this process hosts no worker (a standalone `apps/worker` deployment, or
  // an embedded worker that never started because setup is unfinished). Say which, rather than
  // reporting a success that restarted nothing.
  if (!getWorkerStatus().running) {
    return NextResponse.json(
      {
        ok: false,
        message:
          'Bu süreçte çalışan bir worker yok. Ayrı bir worker süreci kullanıyorsanız onu yeniden başlatın.',
      },
      { status: 409 },
    );
  }

  const result = await restartWorker();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
