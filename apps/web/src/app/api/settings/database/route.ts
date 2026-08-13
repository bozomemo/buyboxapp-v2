/** Settings > Database (doc 06 §9): engine, schema version, migration status — no credentials ever returned. */
import { NextResponse } from 'next/server';
import { checkSchemaVersion } from '@buybox/db';
import { getAppDb, getBootstrapEnv } from '@/lib/server/db';

/** Strips credentials from a connection string, leaving only host/db name for display. */
function redactConnectionString(url: string): string {
  try {
    const parsed = new URL(url.replace(/^sqlite:/, 'file:'));
    if (parsed.protocol === 'file:') return url; // a filesystem path, nothing to redact
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '(ayrıştırılamadı)';
  }
}

export async function GET() {
  const appDb = getAppDb();
  const env = getBootstrapEnv();
  const versionStatus = await checkSchemaVersion(appDb);
  return NextResponse.json({
    dialect: appDb.dialect,
    connection: redactConnectionString(env.DATABASE_URL),
    schemaVersion: versionStatus,
  });
}
