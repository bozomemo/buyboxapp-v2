import { requirePermission } from '@/lib/server/auth/page-guard';
import { BrandProductDetailClient } from './brand-product-detail-client';

export const dynamic = 'force-dynamic';

export default async function BrandProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  const { id } = await params;
  return <BrandProductDetailClient id={id} />;
}
