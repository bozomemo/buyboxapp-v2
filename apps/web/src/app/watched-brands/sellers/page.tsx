import { requirePermission } from '@/lib/server/auth/page-guard';
import { BrandSellersClient } from './brand-sellers-client';

export const dynamic = 'force-dynamic';

export default async function BrandSellersPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <BrandSellersClient />;
}
