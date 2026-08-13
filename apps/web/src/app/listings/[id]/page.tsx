import { ListingDetailClient } from './listing-detail-client';

export const dynamic = 'force-dynamic';

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingDetailClient id={id} />;
}
