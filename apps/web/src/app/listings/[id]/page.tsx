import { requirePermission } from '@/lib/server/auth/page-guard';
import { ListingDetailClient } from './listing-detail-client';

export const dynamic = 'force-dynamic';

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  const { id } = await params;
  return <ListingDetailClient id={id} />;
}
