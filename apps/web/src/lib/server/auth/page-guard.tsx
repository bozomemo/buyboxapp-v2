/**
 * The page half of doc 18 §7.2. A server component calls this first:
 *
 *   const gate = await requirePermission('view');
 *   if (!gate.ok) return gate.element;
 *
 * Signed out, in bootstrap mode, or holding a temporary password: a redirect, as the proxy would
 * have done. Signed in without the permission: a plain "no permission" page — not a redirect,
 * which for a signed-in user would only loop (doc 18 §7.2).
 */
import { hasPermission, type Permission } from '@buybox/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCookieNames } from './config';
import { isBootstrapMode, isValidSetupToken } from './bootstrap';
import { getPageSession } from './current';
import { isMfaRequired } from './mfa';
import { getAppDb } from '../db';
import type { SessionUser } from './session';
import type { GuardOptions } from './guard';

export type PageGate =
  | { readonly ok: true; readonly user: SessionUser | null }
  | { readonly ok: false; readonly element: React.ReactElement };

export async function requirePermission(permission: Permission, options: GuardOptions = {}): Promise<PageGate> {
  if (await isBootstrapMode()) {
    const setup = (await cookies()).get(getCookieNames().setup)?.value;
    if (options.allowSetupAccess && (await isValidSetupToken(setup))) return { ok: true, user: null };
    redirect('/bootstrap');
  }
  const session = await getPageSession();
  if (session === null) redirect('/login');
  if (session.user.mustChangePassword) redirect('/account/password');
  if (!session.user.mfaEnrolled && !options.allowDuringEnrolment && (await isMfaRequired(getAppDb()).catch(() => true))) {
    redirect('/account/mfa-setup');
  }
  if (!hasPermission(session.user.role, permission)) return { ok: false, element: <NoPermission /> };
  return { ok: true, user: session.user };
}

/** Any signed-in user, whatever their role — `/account/password`, which a temporary password opens. */
export async function requireSession(): Promise<SessionUser> {
  if (await isBootstrapMode()) redirect('/bootstrap');
  const session = await getPageSession();
  if (session === null) redirect('/login');
  return session.user;
}

function NoPermission() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded border border-(--color-border) bg-(--color-surface) p-6 text-sm">
      <h1 className="mb-2 text-lg font-bold">Bu sayfayı görüntüleme yetkiniz yok</h1>
      <p className="text-(--color-muted)">
        Rolünüz bu ekrana erişim vermiyor. Erişime ihtiyacınız varsa bir yöneticiye başvurun.
      </p>
    </div>
  );
}
