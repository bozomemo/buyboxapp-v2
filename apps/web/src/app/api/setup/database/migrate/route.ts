import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  checkSchemaVersion,
  configRepo,
  createDb,
  isRelativeSqlitePath,
  newId,
  runMigrations,
} from '@buybox/db';
import { LICENSE_TOKEN_SETTING_KEY } from '@buybox/shared';
import { getAppDb, isBootstrapped, writeBootstrapEnv } from '@/lib/server/db';

/**
 * Carries the active licence into the database the operator is switching to.
 *
 * The licence gate stands in front of the setup wizard (doc 13 §6), so by the time anyone
 * reaches this route they have already activated a licence — into whichever database was
 * configured *then*. Switching database without bringing it along drops the operator straight
 * back onto `/license` having just done that, with no explanation and no indication that the
 * work they did in between survived. Observed on a real install, 2026-08-24.
 *
 * Best-effort on purpose: a licence that cannot be read (the old database is gone, unreadable,
 * or predates the settings table) must not fail a migration that is otherwise fine. The
 * operator can always paste the token again — which is the situation this merely avoids, not a
 * state it must guarantee.
 */
async function carryLicenceForward(target: ReturnType<typeof createDb>): Promise<void> {
  if (!isBootstrapped()) return;
  try {
    const existing = await configRepo.getAppSetting(target, LICENSE_TOKEN_SETTING_KEY);
    if (existing !== undefined) return; // The target already has one; never overwrite it.

    const current = await configRepo.getAppSetting(getAppDb(), LICENSE_TOKEN_SETTING_KEY);
    if (current === undefined) return;

    await configRepo.setAppSetting(
      target,
      {
        key: LICENSE_TOKEN_SETTING_KEY,
        value: current.value,
        updatedBy: 'setup-wizard',
        updatedAt: Date.now(),
      },
      newId(),
    );
  } catch {
    // See above: never fail the migration over this.
  }
}

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

    // Before `.env.local` is rewritten, while `getAppDb()` still opens the outgoing database.
    await carryLicenceForward(appDb);

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
