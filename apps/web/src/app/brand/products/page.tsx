import { requirePermission } from '@/lib/server/auth/page-guard';
import { BrandProductsClient } from './brand-products-client';

export const dynamic = 'force-dynamic';

export default async function BrandProductsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <BrandProductsClient />;
}
