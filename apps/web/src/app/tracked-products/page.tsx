import { requirePermission } from '@/lib/server/auth/page-guard';
import { Suspense } from 'react';
import { TrackedProductsClient } from './tracked-products-client';

export const dynamic = 'force-dynamic';

export default async function TrackedProductsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  // The client reads `?watchedBrandId=` to arrive pre-filtered from the brand links on İzlenen
  // Markalar, and `useSearchParams` must sit under a Suspense boundary or the whole route opts
  // out of prerendering with a build-time error.
  return (
    <Suspense fallback={null}>
      <TrackedProductsClient />
    </Suspense>
  );
}
