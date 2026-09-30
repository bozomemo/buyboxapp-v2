import { requirePermission } from '@/lib/server/auth/page-guard';
import { StockClient } from './stock-client';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <StockClient />;
}
