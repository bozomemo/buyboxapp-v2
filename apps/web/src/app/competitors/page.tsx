import { requirePermission } from '@/lib/server/auth/page-guard';
import { CompetitorsClient } from './competitors-client';

export const dynamic = 'force-dynamic';

export default async function CompetitorsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <CompetitorsClient />;
}
