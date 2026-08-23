/**
 * The packaged install's entry point (doc 14 §4.1). Copied next to Next's generated
 * `server.js` by `build-package.ps1`; the Windows service runs *this*, not `server.js`.
 *
 * It exists for two reasons, both of them things Next's standalone server does that the
 * installed layout cannot live with.
 *
 * **1. `server.js` calls `process.chdir(__dirname)`.** Measured against Next 16's generated
 * output on 2026-08-24. That would move the working directory into `Program Files\BuyBox\app`,
 * where the service account cannot write and where an upgrade deletes everything — and the app
 * resolves `.env.local` against `process.cwd()` (`apps/web/src/lib/server/db.ts`), which the
 * setup wizard *writes* when the operator picks a database. So this restores the original
 * working directory once `server.js` has finished starting. Next itself is unaffected: it
 * captured its own directory as an absolute path before we changed anything back.
 *
 * **2. `.env.local` loading is Next's implementation detail, not a contract.** The file holds
 * `DATABASE_URL`, `SECRET_STORE_KEY` and `SECRET_STORE_PATH`, and the failure mode if Next ever
 * stopped reading it is an install that cannot find its own database. Reading it here makes
 * that independent of Next.
 *
 * Values already in the environment win. The service defines the deployment facts the operator
 * cannot change from the UI (`PORT`, `HOSTNAME`, `AUTO_MIGRATE`, `APP_VERSION`,
 * `PLAYWRIGHT_BROWSERS_PATH`), and a stale line in a file must never override those.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dataDir = process.cwd();
const envPath = path.join(dataDir, '.env.local');

if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

await import('./server.js');

// `server.js` chdir'd during its module evaluation, which has now completed. Put it back before
// the first request can observe it.
if (process.cwd() !== dataDir) {
  process.chdir(dataDir);
}
