import { requirePermission } from '@/lib/server/auth/page-guard';
import { FindingsClient } from './findings-client';

export const dynamic = 'force-dynamic';

export default async function BrandFindingsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <FindingsClient />;
}
