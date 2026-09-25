import { BrandProductDetailClient } from './brand-product-detail-client';

export const dynamic = 'force-dynamic';

export default async function BrandProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BrandProductDetailClient id={id} />;
}
