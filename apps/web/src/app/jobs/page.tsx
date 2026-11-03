import { PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/server/auth/page-guard';
import { JobsClient } from './jobs-client';

export const dynamic = 'force-dynamic';

export default async function JobsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return (
    <div className="space-y-3">
      <PageHeader title="İşler" breadcrumb={[{ label: 'Sistem' }, { label: 'İşler' }]} />
      <JobsClient />
    </div>
  );
}
