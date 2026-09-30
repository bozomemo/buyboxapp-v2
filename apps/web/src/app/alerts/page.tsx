import { requirePermission } from '@/lib/server/auth/page-guard';
import { AlertsClient } from './alerts-client';

export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <AlertsClient />;
}
