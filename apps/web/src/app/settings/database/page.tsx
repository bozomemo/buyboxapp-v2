import { requirePermission } from '@/lib/server/auth/page-guard';
import { SettingsNav } from '../settings-nav';
import { DatabaseClient } from './database-client';

export const dynamic = 'force-dynamic';

export default async function SettingsDatabasePage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <DatabaseClient />
    </div>
  );
}
