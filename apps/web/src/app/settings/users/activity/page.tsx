import { requirePermission } from '@/lib/server/auth/page-guard';
import { ActivityClient } from './activity-client';

/** doc 06 §10.4 _Giriş kayıtları_, doc 18 §9.2. */
export const dynamic = 'force-dynamic';

export default async function UsersActivityPage() {
  const gate = await requirePermission('users.manage');
  if (!gate.ok) return gate.element;
  return <ActivityClient />;
}
