import { requirePermission } from '@/lib/server/auth/page-guard';
import { SellersClient } from './sellers-client';

export const dynamic = 'force-dynamic';

export default async function SellersPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <SellersClient />;
}
