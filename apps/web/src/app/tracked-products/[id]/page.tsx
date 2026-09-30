import { requirePermission } from '@/lib/server/auth/page-guard';
import { TrackedProductDetailClient } from './tracked-product-detail-client';

export const dynamic = 'force-dynamic';

export default async function TrackedProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  const { id } = await params;
  return <TrackedProductDetailClient id={id} />;
}
