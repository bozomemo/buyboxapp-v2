import { PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/server/auth/page-guard';
import { SettingsNav } from '../settings-nav';
import { MarketplacesClient } from './marketplaces-client';

export const dynamic = 'force-dynamic';

export default async function SettingsMarketplacesPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return (
    <div className="space-y-4">
      <PageHeader title="Ayarlar" breadcrumb={[{ label: 'Sistem' }, { label: 'Ayarlar' }]} />
      <SettingsNav />
      <MarketplacesClient />
    </div>
  );
}
