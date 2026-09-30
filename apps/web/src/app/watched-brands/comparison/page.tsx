import { requirePermission } from '@/lib/server/auth/page-guard';
import { BrandComparisonClient } from './brand-comparison-client';

export const dynamic = 'force-dynamic';

export default async function BrandComparisonPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <BrandComparisonClient />;
}
