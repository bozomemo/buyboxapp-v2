import { requireSession } from '@/lib/server/auth/page-guard';
import { PasswordClient } from './password-client';

/** Change one's own password (doc 06 §10.3); the only screen a temporary password opens. */
export const dynamic = 'force-dynamic';

export default async function PasswordPage() {
  await requireSession();
  return <PasswordClient />;
}
