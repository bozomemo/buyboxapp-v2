import { requirePermission } from '@/lib/server/auth/page-guard';
import { BrandListingsClient } from './listings-client';

export const dynamic = 'force-dynamic';

export default async function BrandListingsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <BrandListingsClient />;
}
