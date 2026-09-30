import { requirePermission } from '@/lib/server/auth/page-guard';
import { WatchedBrandsClient } from './watched-brands-client';

export const dynamic = 'force-dynamic';

export default async function WatchedBrandsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <WatchedBrandsClient />;
}
