import { SettingsNav } from '../settings-nav';
import { ProductSourcesClient } from './product-sources-client';

export const dynamic = 'force-dynamic';

export default function SettingsProductSourcesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <ProductSourcesClient />
    </div>
  );
}
