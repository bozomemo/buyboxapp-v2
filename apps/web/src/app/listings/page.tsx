import { requirePermission } from '@/lib/server/auth/page-guard';
import { ListingsClient } from './listings-client';

export const dynamic = 'force-dynamic';

export default async function ListingsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <ListingsClient />;
}
