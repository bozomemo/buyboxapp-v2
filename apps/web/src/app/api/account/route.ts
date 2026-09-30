/**
 * One's own account (doc 06 §10.3): sessions and trusted devices, and ending them. Every role
 * holds `view`, so every signed-in user reaches this — and every query is scoped to the caller,
 * so nobody can list or end somebody else's session through it.
 */
import { NextResponse } from 'next/server';
import { authRepo } from '@buybox/db';
import { ROLE_LABELS, maskPhone } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { recordAuthEvent, requestMeta } from '@/lib/server/auth/config';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import { isSmsAvailable } from '@/lib/server/auth/sms';
import { readJsonObject } from '@/lib/server/request-body';

export const dynamic = 'force-dynamic';

async function getHandler(_request: Request, _context: unknown, auth: AuthContext) {
  const user = auth.user!;
  const appDb = getAppDb();
  const [row, sessions, devices, recoveryLeft] = await Promise.all([
    authRepo.getUserById(appDb, user.id),
    authRepo.listSessionsForUser(appDb, user.id),
    authRepo.listTrustedDevices(appDb, user.id),
    authRepo.countUnusedRecoveryCodes(appDb, user.id),
  ]);
  return NextResponse.json({
    user: {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      lastLoginAt: row?.lastLoginAt ?? null,
      totpEnabled: row?.totpEnabled ?? false,
      smsEnabled: row?.smsEnabled ?? false,
      phoneVerified: row?.phoneVerifiedAt != null,
      phoneHint: row?.phoneE164 ? maskPhone(row.phoneE164) : null,
      // SMS is offered only while a provider is configured (doc 18 §5.3).
      smsAvailable: isSmsAvailable(),
      recoveryCodesLeft: recoveryLeft,
    },
    sessions: sessions.map((s) => ({
      id: s.id,
      current: s.id === auth.sessionId,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      ip: s.ip,
      userAgent: s.userAgent,
    })),
    devices: devices.map((d) => ({ id: d.id, label: d.label, createdAt: d.createdAt, expiresAt: d.expiresAt, lastUsedAt: d.lastUsedAt })),
  });
}

/**
 * `{ action: 'endSession', id }`, `{ action: 'endOtherSessions' }`, `{ action: 'forgetDevice', id }`,
 * `{ action: 'signOutEverywhere' }` — the last ends every session including this one and forgets
 * every device (doc 18 §5.1 _Tüm cihazlardan çıkış yap_).
 */
async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const user = auth.user!;
  const body = await readJsonObject(request);
  if (body === null || typeof body.action !== 'string') {
    return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 });
  }
  const appDb = getAppDb();
  const meta = requestMeta(request.headers);
  switch (body.action) {
    case 'endSession':
      if (typeof body.id !== 'string') return NextResponse.json({ error: 'Oturum kimliği gerekli.' }, { status: 400 });
      await authRepo.deleteSession(appDb, body.id, user.id);
      await recordAuthEvent(appDb, 'session.revoked', { userId: user.id, actor: auth.actor, meta });
      break;
    case 'endOtherSessions':
      await authRepo.deleteSessionsForUser(appDb, user.id, auth.sessionId === null ? {} : { exceptSessionId: auth.sessionId });
      await recordAuthEvent(appDb, 'session.revoked', { userId: user.id, actor: auth.actor, meta, detail: { scope: 'others' } });
      break;
    case 'forgetDevice':
      if (typeof body.id !== 'string') return NextResponse.json({ error: 'Cihaz kimliği gerekli.' }, { status: 400 });
      await authRepo.deleteTrustedDevices(appDb, user.id, body.id);
      await recordAuthEvent(appDb, 'device.revoked', { userId: user.id, actor: auth.actor, meta });
      break;
    case 'signOutEverywhere':
      await authRepo.deleteSessionsForUser(appDb, user.id);
      await authRepo.deleteTrustedDevices(appDb, user.id);
      await recordAuthEvent(appDb, 'session.revoked', { userId: user.id, actor: auth.actor, meta, detail: { scope: 'all' } });
      break;
    default:
      return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('view', postHandler);
