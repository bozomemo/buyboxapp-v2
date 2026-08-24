/**
 * The connection string the wizard should offer for SQLite (doc 10 §6 step 1).
 *
 * It comes from the server rather than being a constant in the client because only the server
 * knows where this deployment keeps its data: the packaged install sets `BUYBOX_DATA_DIR`
 * (doc 14 §4.1), a checkout does not. The wizard used to hardcode `file:./data/app.db`, and a
 * relative path is precisely what split a real install's database in two on 2026-08-24 — see
 * `appDataDir` in `packages/db/src/dialect.ts`.
 */
import path from 'node:path';
import { NextResponse } from 'next/server';
import { appDataDir } from '@buybox/db';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    sqlite: `file:${path.join(appDataDir(), 'data', 'app.db')}`,
    dataDir: appDataDir(),
  });
}
