import { SettingsNav } from '../settings-nav';
import { DatabaseClient } from './database-client';

export const dynamic = 'force-dynamic';

export default function SettingsDatabasePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <DatabaseClient />
    </div>
  );
}
