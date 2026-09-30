import { requirePermission } from '@/lib/server/auth/page-guard';
import { SettingsNav } from './settings-nav';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <p className="text-sm text-(--color-muted)">
        Yukarıdan bir bölüm seçin. Her değişiklik denetim kaydına işlenir (kim, ne zaman, eski/yeni değer).
      </p>
    </div>
  );
}
