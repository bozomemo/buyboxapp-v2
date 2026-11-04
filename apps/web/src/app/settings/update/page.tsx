import { PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/server/auth/page-guard';
import { SettingsNav } from '../settings-nav';
import { UpdateClient } from './update-client';

export const dynamic = 'force-dynamic';

/** Settings > Güncelleme (auto-update spec §5.3). Installing is an administrator's act. */
export default async function SettingsUpdatePage() {
  const gate = await requirePermission('settings.manage');
  if (!gate.ok) return gate.element;
  return (
    <div className="space-y-4">
      <PageHeader title="Ayarlar" breadcrumb={[{ label: 'Sistem' }, { label: 'Ayarlar' }]} />
      <SettingsNav />
      <UpdateClient />
    </div>
  );
}
