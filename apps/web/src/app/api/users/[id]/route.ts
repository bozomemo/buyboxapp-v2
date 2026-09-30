/**
 * One administrative action on one user (doc 06 §10.4): change role, disable, re-enable, reset
 * password, reset second factor, unlock. `users.manage` only; the last-administrator rule
 * (doc 18 §6.3) is enforced in `applyUserAction`, not trusted from the screen.
 */
import { NextResponse } from 'next/server';
import { getAppDb, isBootstrapped } from '@/lib/server/db';
import { getSecretStore } from '@/lib/server/secrets';
import { requestMeta } from '@/lib/server/auth/config';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import { applyUserAction, UserActionError, type UserAction } from '@/lib/server/auth/users';
import { readJsonObject } from '@/lib/server/request-body';

const ACTIONS = new Set(['setRole', 'disable', 'enable', 'resetPassword', 'resetMfa', 'unlock']);

async function patchHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
  auth: AuthContext,
) {
  const { id } = await params;
  const body = await readJsonObject(request);
  if (body === null || typeof body.action !== 'string' || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: 'Geçersiz işlem.' }, { status: 400 });
  }
  try {
    await applyUserAction(
      getAppDb(),
      isBootstrapped() ? getSecretStore() : null,
      id,
      body as unknown as UserAction,
      auth,
      requestMeta(request.headers),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UserActionError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export const PATCH = withPermission('users.manage', patchHandler);
