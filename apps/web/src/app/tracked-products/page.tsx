import { Suspense } from 'react';
import { TrackedProductsClient } from './tracked-products-client';

export const dynamic = 'force-dynamic';

export default function TrackedProductsPage() {
  // The client reads `?watchedBrandId=` to arrive pre-filtered from the brand links on İzlenen
  // Markalar, and `useSearchParams` must sit under a Suspense boundary or the whole route opts
  // out of prerendering with a build-time error.
  return (
    <Suspense fallback={null}>
      <TrackedProductsClient />
    </Suspense>
  );
}
