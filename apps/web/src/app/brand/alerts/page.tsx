import { requirePermission } from '@/lib/server/auth/page-guard';
import { BrandAlertsClient } from './alerts-client';

export const dynamic = 'force-dynamic';

export default async function BrandAlertsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <BrandAlertsClient />;
}
