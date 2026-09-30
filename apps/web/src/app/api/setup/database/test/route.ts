import { NextResponse } from 'next/server';
import { createDb } from '@buybox/db';
import { sql } from 'drizzle-orm';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';

async function postHandler(request: Request) {
  const body = await readJsonBody<{
    engine: 'sqlite' | 'postgres' | 'mysql';
    connectionString: string;
  }>(request);
  if (body === null) return invalidBody();
  let appDb;
  try {
    appDb = createDb(body.connectionString, body.engine);
    // A trivial round trip is enough to confirm the driver can actually reach the server —
    // schema existence is checked separately, by the migrate step. Each dialect's `db.execute`
    // overload set is mutually incompatible, so this is narrowed per dialect rather than
    // called through the `AppDatabase['db']` union type.
    if (appDb.dialect === 'sqlite') {
      appDb.db.get(sql`select 1`);
    } else if (appDb.dialect === 'postgres') {
      await appDb.db.execute(sql`select 1`);
    } else {
      await appDb.db.execute(sql`select 1`);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    appDb?.close();
  }
}

export const POST = withPermission('settings.manage', postHandler, { allowSetupAccess: true });
