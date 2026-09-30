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
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import { carryAdministratorForward } from '@/lib/server/auth/users';
import { forgetAdminCache } from '@/lib/server/auth/bootstrap';

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
async function carryLicenceForward(target: ReturnType<typeof createDb>, actor: string): Promise<void> {
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
        updatedBy: actor,
        updatedAt: Date.now(),
      },
      newId(),
    );
  } catch {
    // See above: never fail the migration over this.
  }
}

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const body = await readJsonBody<{
    engine: 'sqlite' | 'postgres' | 'mysql';
    connectionString: string;
  }>(request);
  if (body === null) return invalidBody();

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
    await carryLicenceForward(appDb, auth.actor);
    // doc 18 §8.2: a target with no administrator would otherwise drop the operator into
    // bootstrap mode halfway through the wizard. Only when a database is already open — a
    // first-time database step (setup token, no users anywhere yet) has nobody to carry.
    if (isBootstrapped()) await carryAdministratorForward(getAppDb(), appDb, auth);

    // Persist bootstrap config now that the database is confirmed reachable and migrated —
    // this is the app writing its own .env.local, not the operator editing a file (doc 12 6.2).
    await writeBootstrapEnv({
      DATABASE_URL: body.connectionString,
      SECRET_STORE_KEY: process.env.SECRET_STORE_KEY ?? randomBytes(32).toString('hex'),
    });
    forgetAdminCache();

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

export const POST = withPermission('settings.manage', postHandler, { allowSetupAccess: true });
