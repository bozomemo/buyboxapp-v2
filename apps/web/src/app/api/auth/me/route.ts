/**
 * Who is signed in, and what they may do — for the header and for hiding controls (doc 06
 * §10.5). Hiding is a courtesy; the handlers refuse regardless (doc 18 §7.2).
 */
import { NextResponse } from 'next/server';
import { PERMISSIONS, ROLE_LABELS, hasPermission } from '@buybox/shared';
import { getRequestSession } from '@/lib/server/auth/current';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const current = await getRequestSession(request);
  if (current === null) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Oturum açmanız gerekiyor.' }, { status: 401 });
  }
  const { user } = current;
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      mustChangePassword: user.mustChangePassword,
      permissions: PERMISSIONS.filter((permission) => hasPermission(user.role, permission)),
    },
  });
}
