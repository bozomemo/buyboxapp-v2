import { SettingsNav } from '../settings-nav';
import { RetentionClient } from './retention-client';

export const dynamic = 'force-dynamic';

export default function SettingsRetentionPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <RetentionClient />
    </div>
  );
}
