import { SettingsNav } from '../settings-nav';
import { MarketplacesClient } from './marketplaces-client';

export const dynamic = 'force-dynamic';

export default function SettingsMarketplacesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <MarketplacesClient />
    </div>
  );
}
