import { requirePermission } from '@/lib/server/auth/page-guard';
import { UnmatchedCardsClient } from './unmatched-client';

export const dynamic = 'force-dynamic';

export default async function UnmatchedCardsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <UnmatchedCardsClient />;
}
