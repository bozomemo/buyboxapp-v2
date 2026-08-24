/**
 * The connection string the wizard should offer for SQLite (doc 10 §6 step 1).
 *
 * It comes from the server rather than being a constant in the client because only the server
 * knows where this deployment keeps its data: the packaged install sets `BUYBOX_DATA_DIR`
 * (doc 14 §4.1), a checkout does not. The wizard used to hardcode `file:./data/app.db`, and a
 * relative path is precisely what split a real install's database in two on 2026-08-24 — see
 * `appDataDir` in `packages/db/src/dialect.ts`.
 *
 * It then split a second install in two on 2026-08-24, absolutely, by *inventing* a path
 * instead of reading the one that already existed. The installer writes
 * `DATABASE_URL=file:<data dir>\app.db` before the operator ever sees the wizard
 * (`installer/configure-env.ps1`); this route suggested `<data dir>\data\app.db`, one directory
 * deeper, because it appended a `data` segment that only a checkout needs — `BUYBOX_DATA_DIR`
 * *is* the data directory, it does not contain one. The operator accepted the suggestion, as
 * they should be able to, and the migrate step created and adopted a second database while the
 * running worker held the first. Both healthy, both live, neither seeing the other's jobs.
 *
 * So: an install that is already configured is offered *its own* database, never a
 * reconstructed guess at one. A path is only derived when there is nothing to read, which is
 * the one case where no second database can exist yet.
 */
import path from 'node:path';
import { NextResponse } from 'next/server';
import { appDataDir } from '@buybox/db';
import { tryGetBootstrapEnv } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export function GET() {
  const dataDir = appDataDir();
  const configured = tryGetBootstrapEnv()?.DATABASE_URL?.trim();

  if (configured !== undefined && configured !== '') {
    return NextResponse.json({ sqlite: configured, dataDir, configured: true });
  }

  // Nothing configured — a checkout, or an install whose `.env.local` was removed. Only here is
  // the `data` segment right, and only when `appDataDir()` fell back to the working directory:
  // a checkout keeps its database in `data/` beside the app, a packaged install does not.
  const isPackaged = (process.env.BUYBOX_DATA_DIR ?? '').trim() !== '';
  const file = isPackaged ? path.join(dataDir, 'app.db') : path.join(dataDir, 'data', 'app.db');
  return NextResponse.json({ sqlite: `file:${file}`, dataDir, configured: false });
}
