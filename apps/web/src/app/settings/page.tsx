import { PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/server/auth/page-guard';
import { SettingsNav } from './settings-nav';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Ayarlar"
        breadcrumb={[{ label: 'Sistem' }, { label: 'Ayarlar' }]}
        description="Aşağıdan bir bölüm seçin. Her değişiklik denetim kaydına işlenir (kim, ne zaman, eski/yeni değer)."
      />
      <SettingsNav />
    </div>
  );
}
