import { requirePermission } from '@/lib/server/auth/page-guard';
import { PolicyClient } from './policy-client';

export const dynamic = 'force-dynamic';

export default async function SellerPolicyPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return <PolicyClient />;
}
