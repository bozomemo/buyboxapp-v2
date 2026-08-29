import { Suspense } from 'react';
import { SellerDetailClient } from './seller-detail-client';

export const dynamic = 'force-dynamic';

export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ marketplace: string; ref: string }>;
}) {
  const { marketplace, ref } = await params;
  // The client reads `?watchedBrandId=` and `?sinceMs=` so a link from a brand-audit finding
  // lands on the rows that finding is about; `useSearchParams` must sit under a Suspense
  // boundary or the route opts out of prerendering with a build-time error.
  return (
    <Suspense fallback={null}>
      <SellerDetailClient marketplace={marketplace} sellerRef={decodeURIComponent(ref)} />
    </Suspense>
  );
}
