import { SellerDetailClient } from './seller-detail-client';

export const dynamic = 'force-dynamic';

export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ marketplace: string; ref: string }>;
}) {
  const { marketplace, ref } = await params;
  return <SellerDetailClient marketplace={marketplace} sellerRef={decodeURIComponent(ref)} />;
}
