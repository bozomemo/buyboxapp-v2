import { requirePermission } from '@/lib/server/auth/page-guard';
import { BrandsClient } from './brands-client';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <BrandsClient />;
}
