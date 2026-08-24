import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkSchemaVersion, createDb, isRelativeSqlitePath, runMigrations } from '@buybox/db';
import { writeBootstrapEnv } from '@/lib/server/db';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    engine: 'sqlite' | 'postgres' | 'mysql';
    connectionString: string;
  };

  // A relative SQLite path is stored verbatim and resolved by whoever opens it, whenever they
  // open it. On the packaged install that produced two live databases from one setting — the
  // web on one, the embedded worker on the other, neither reporting a fault (see `appDataDir`
  // in packages/db). `createDb` now anchors relative paths so this can no longer split, but the
  // wizard is where the operator picks the value and it is worth refusing here rather than
  // silently rewriting what they typed.
  if (isRelativeSqlitePath(body.connectionString)) {
    return NextResponse.json({
      ok: false,
      error:
        String.raw`SQLite yolu mutlak olmalıdır (örnek: file:C:\ProgramData\BuyBox\data\app.db). Göreli bir yol, uygulamanın farklı parçalarının farklı veritabanı dosyaları açmasına yol açar.`,
    });
  }

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
