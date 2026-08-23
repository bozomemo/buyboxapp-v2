/**
 * Licence status and activation (docs/13-licensing.md §3, §6). Exempt from the middleware gate
 * — an unlicensed install must still be able to read its own status and paste a licence, or
 * there is no way out of the gate.
 *
 * GET is safe to expose unauthenticated for the same reason the token itself is not a secret
 * (doc 13 §3): it reveals the customer name and expiry already printed on the licence.
 */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import {
  LICENSE_TOKEN_ENV_VAR,
  LICENSE_TOKEN_SETTING_KEY,
  resolveLicensePublicKey,
  verifyLicense,
} from '@buybox/shared';
import { getAppDb, isBootstrapped, removeBootstrapEnv, writeBootstrapEnv } from '@/lib/server/db';
import { invalidateLicenseCache, readLicenseStatus } from '@/lib/server/license';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await readLicenseStatus();
  return NextResponse.json({
    status,
    // Whether the active licence came from the environment (doc 13 §3). Shown as a note, not
    // as a reason to hide the paste box: a licence parked in `.env.local` during setup is
    // adopted into the database by the next save, so renewing through this screen still works.
    managedByEnvironment: (process.env[LICENSE_TOKEN_ENV_VAR] ?? '').trim() !== '',
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { token?: unknown };
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  // Verified before it is stored, so a typo can never replace a working licence with a broken
  // one and lock the operator out of the very screen they would fix it from.
  const status = verifyLicense(token, {
    publicKeyPem: resolveLicensePublicKey(process.env),
    nowMs: Date.now(),
  });
  if (status.state === 'invalid' || status.state === 'missing') {
    return NextResponse.json({ status }, { status: 400 });
  }

  if (!isBootstrapped()) {
    // Licensing gates the setup wizard too (doc 13 §6), so a licence can be pasted before there
    // is any database to store it in. It is parked in `.env.local` — the same mechanism the
    // wizard already uses to write `DATABASE_URL` on the operator's behalf — and adopted into
    // `app_settings` by the first save made once the database exists.
    await writeBootstrapEnv({ [LICENSE_TOKEN_ENV_VAR]: token });
    invalidateLicenseCache();
    return NextResponse.json({ status, storedIn: 'env' });
  }

  await configRepo.setAppSetting(
    getAppDb(),
    {
      key: LICENSE_TOKEN_SETTING_KEY,
      value: token,
      updatedBy: 'operator',
      updatedAt: Date.now(),
    },
    newId(),
  );
  // The environment wins over the stored row (doc 13 §3), so a token parked there during setup
  // would shadow this one and make every future renewal through this screen a silent no-op.
  await removeBootstrapEnv([LICENSE_TOKEN_ENV_VAR]);
  invalidateLicenseCache();
  return NextResponse.json({ status, storedIn: 'database' });
}
