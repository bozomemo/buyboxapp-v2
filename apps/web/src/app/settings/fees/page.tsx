import { SettingsNav } from '../settings-nav';
import { FeesClient } from './fees-client';

export const dynamic = 'force-dynamic';

export default function SettingsFeesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <FeesClient />
    </div>
  );
}
