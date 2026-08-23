/**
 * Liveness and schema report (doc 14 §5.1). The installer polls this after starting the service
 * and **fails the installation** if it never answers — so this route's job is to answer, always,
 * and to say what is wrong in the body rather than by failing.
 *
 * Two consequences shape it:
 *
 * 1. It is exempt from the licence gate (`apps/web/src/proxy.ts`). Verification happens before
 *    any licence exists, and a 402 here would make every first install look broken.
 * 2. It returns 200 even when the database is unreachable or unmigrated. It *reports*
 *    connectivity; it does not depend on it. A fresh install has no `.env.local` at all until
 *    the wizard writes one, and that is a healthy process, not a failed one.
 *
 * `status` is therefore about the process: `ok` once the database answers and its schema matches
 * this build, `degraded` while anything below that is still true.
 */
import { NextResponse } from 'next/server';
import { checkSchemaVersion } from '@buybox/db';
import { getAppDb, isBootstrapped } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

interface DatabaseReport {
  readonly configured: boolean;
  readonly reachable: boolean;
  readonly dialect?: string;
  readonly schema?: { readonly drift: string; readonly applied: number; readonly expected: number };
  readonly error?: string;
}

async function describeDatabase(): Promise<DatabaseReport> {
  if (!isBootstrapped()) return { configured: false, reachable: false };
  try {
    const appDb = getAppDb();
    const status = await checkSchemaVersion(appDb);
    return {
      configured: true,
      reachable: true,
      dialect: appDb.dialect,
      schema: { drift: status.drift, applied: status.appliedCount, expected: status.expectedCount },
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const database = await describeDatabase();
  const healthy = database.reachable && database.schema?.drift === 'up-to-date';
  return NextResponse.json({
    status: healthy ? 'ok' : 'degraded',
    version: process.env.APP_VERSION ?? null,
    database,
    at: new Date().toISOString(),
  });
}
