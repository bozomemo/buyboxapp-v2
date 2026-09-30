import { requirePermission } from '@/lib/server/auth/page-guard';
import { AccountClient } from './account-client';

/** doc 06 §10.3 — every signed-in user's own account. */
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <AccountClient />;
}
