import { SettingsNav } from './settings-nav';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ayarlar</h1>
      <SettingsNav />
      <p className="text-sm text-[var(--color-muted)]">
        Yukarıdan bir bölüm seçin. Her değişiklik denetim kaydına işlenir (kim, ne zaman, eski/yeni değer).
      </p>
    </div>
  );
}
