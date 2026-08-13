import { SettingsNav } from '../settings-nav';
import { PolicyClient } from './policy-client';

export const dynamic = 'force-dynamic';

export default function SettingsPolicyPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <PolicyClient />
    </div>
  );
}
