import { PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/server/auth/page-guard';
import { SettingsNav } from '../settings-nav';
import { NotificationsClient } from './notifications-client';

export const dynamic = 'force-dynamic';

export default async function SettingsNotificationsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return (
    <div className="space-y-4">
      <PageHeader title="Ayarlar" breadcrumb={[{ label: 'Sistem' }, { label: 'Ayarlar' }]} />
      <SettingsNav />
      <NotificationsClient />
    </div>
  );
}
