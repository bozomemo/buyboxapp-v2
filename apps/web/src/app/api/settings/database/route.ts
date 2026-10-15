/** Settings > Database (doc 06 §9): engine, schema version, migration status — no credentials ever returned. */
import { NextResponse } from 'next/server';
import { checkSchemaVersion, redactDatabaseUrl } from '@buybox/db';
import { getAppDb, getBootstrapEnv } from '@/lib/server/db';
import { withPermission } from '@/lib/server/auth/guard';

async function getHandler() {
  const appDb = getAppDb();
  const env = getBootstrapEnv();
  const versionStatus = await checkSchemaVersion(appDb);
  return NextResponse.json({
    dialect: appDb.dialect,
    connection: redactDatabaseUrl(env.DATABASE_URL),
    schemaVersion: versionStatus,
  });
}

export const GET = withPermission('view', getHandler);
