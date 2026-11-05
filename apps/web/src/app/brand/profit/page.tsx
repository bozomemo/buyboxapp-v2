import { requirePermission } from '@/lib/server/auth/page-guard';
import { ProfitSettingsClient } from './profit-client';

export const dynamic = 'force-dynamic';

export default async function BrandProfitPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <ProfitSettingsClient />;
}
