/**
 * One's own second factor (doc 18 §5.2, §5.4; doc 06 §10.3):
 *
 *   { action: 'totpStart' }                         → { secret, qrSvg }
 *   { action: 'totpConfirm', code }                 → { recoveryCodes | null }
 *   { action: 'totpRemove', password }
 *   { action: 'recoveryRegenerate', password }      → { recoveryCodes }
 *   { action: 'smsStart', phone }                   → { phone }       (sends a code)
 *   { action: 'smsConfirm', code }                  → { recoveryCodes | null }
 *   { action: 'smsRemove', password }
 *
 * Reachable during mandatory enrolment (`allowDuringEnrolment`), which is the one thing a user
 * without a second factor can do on an install that requires one. Removing a method and
 * reissuing codes ask for the password again.
 */
import { NextResponse } from 'next/server';
import { authRepo, configRepo } from '@buybox/db';
import { userActor } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { getSecretStore } from '@/lib/server/secrets';
import { recordAuthEvent, requestMeta } from '@/lib/server/auth/config';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import {
  MfaError,
  confirmPassword,
  confirmTotpEnrolment,
  issueRecoveryCodes,
  isMfaEnrolled,
  removeSms,
  removeTotp,
  startTotpEnrolment,
} from '@/lib/server/auth/mfa';
import { SmsError, confirmPhoneEnrolment, getSmsSender, startPhoneEnrolment } from '@/lib/server/auth/sms';
import { readJsonObject } from '@/lib/server/request-body';

/** `BuyBox (<store display name>)`, so two installs on one phone can be told apart (doc 18 §5.2). */
async function issuer(): Promise<string> {
  try {
    // Stored as plain text by the setup wizard's store step, not as JSON.
    const name = (await configRepo.getAppSetting(getAppDb(), 'store.displayName'))?.value.trim();
    if (name) return `BuyBox (${name})`;
  } catch {
    // Fall through to the plain name.
  }
  return 'BuyBox';
}

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const user = auth.user!;
  const body = await readJsonObject(request);
  if (body === null || typeof body.action !== 'string') {
    return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 });
  }
  const appDb = getAppDb();
  const secretStore = getSecretStore();
  const meta = requestMeta(request.headers);
  try {
    switch (body.action) {
      case 'totpStart':
        return NextResponse.json(await startTotpEnrolment(appDb, secretStore, user, await issuer()));
      case 'totpConfirm':
        if (typeof body.code !== 'string') return NextResponse.json({ error: 'Kod gerekli.' }, { status: 400 });
        return NextResponse.json(await confirmTotpEnrolment(appDb, secretStore, user.id, body.code, meta));
      case 'totpRemove':
        await confirmPassword(appDb, user.id, body.password);
        await removeTotp(appDb, secretStore, user.id, meta);
        return NextResponse.json({ ok: true });
      case 'recoveryRegenerate': {
        await confirmPassword(appDb, user.id, body.password);
        const row = await authRepo.getUserById(appDb, user.id);
        if (row === undefined || !isMfaEnrolled(row)) {
          throw new MfaError('Kurtarma kodları ancak iki adımlı doğrulama kuruluyken oluşturulabilir.', 409);
        }
        const recoveryCodes = await issueRecoveryCodes(appDb, user.id);
        await recordAuthEvent(appDb, 'recovery.regenerated', { userId: user.id, actor: userActor(user.id), meta });
        return NextResponse.json({ recoveryCodes });
      }
      case 'smsStart':
        return NextResponse.json(await startPhoneEnrolment(appDb, getSmsSender(), user.id, body.phone, meta));
      case 'smsConfirm': {
        if (typeof body.code !== 'string') return NextResponse.json({ error: 'Kod gerekli.' }, { status: 400 });
        const { firstMethod } = await confirmPhoneEnrolment(appDb, user.id, body.code, meta);
        return NextResponse.json({ recoveryCodes: firstMethod ? await issueRecoveryCodes(appDb, user.id) : null });
      }
      case 'smsRemove':
        await confirmPassword(appDb, user.id, body.password);
        await removeSms(appDb, user.id, meta);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof MfaError || error instanceof SmsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = withPermission('view', postHandler, { allowDuringEnrolment: true });
