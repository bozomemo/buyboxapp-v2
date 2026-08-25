import { TrackedProductDetailClient } from './tracked-product-detail-client';

export const dynamic = 'force-dynamic';

export default async function TrackedProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrackedProductDetailClient id={id} />;
}
