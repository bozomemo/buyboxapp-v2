import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkSchemaVersion, createDb, runMigrations } from '@buybox/db';
import { writeBootstrapEnv } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    engine: 'sqlite' | 'postgres' | 'mysql';
    connectionString: string;
  };
  let appDb;
  try {
    appDb = createDb(body.connectionString, body.engine);
    await runMigrations(appDb);
    const status = await checkSchemaVersion(appDb);
    if (!status.upToDate) {
      return NextResponse.json({
        ok: false,
        error: `${status.appliedCount}/${status.expectedCount} migrasyon uygulandı — beklenmedik durum.`,
      });
    }

    // Persist bootstrap config now that the database is confirmed reachable and migrated —
    // this is the app writing its own .env.local, not the operator editing a file (doc 12 6.2).
    await writeBootstrapEnv({
      DATABASE_URL: body.connectionString,
      SECRET_STORE_KEY: process.env.SECRET_STORE_KEY ?? randomBytes(32).toString('hex'),
    });

    return NextResponse.json({
      ok: true,
      appliedCount: status.appliedCount,
      expectedCount: status.expectedCount,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    appDb?.close();
  }
}
