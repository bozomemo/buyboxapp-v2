import { requirePermission } from '@/lib/server/auth/page-guard';
import { JobsClient } from './jobs-client';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">İşler</h1>
      <JobsClient />
    </div>
  );
}
