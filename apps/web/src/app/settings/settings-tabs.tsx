'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { moduleForPath } from '@/lib/module-routes';
import { useCan } from '@/lib/permissions';

const TABS = [
  { href: '/settings/modules', label: 'Modüller' },
  { href: '/settings/marketplaces', label: 'Pazaryerleri' },
  { href: '/settings/fees', label: 'Ücretler' },
  { href: '/settings/policy', label: 'Politika' },
  { href: '/settings/product-sources', label: 'Ürün Kaynakları' },
  { href: '/settings/retention', label: 'Saklama' },
  { href: '/settings/database', label: 'Veritabanı' },
  // Doc 13 §6: the licence screen itself is the one route reachable while unlicensed, so it
  // lives outside `/settings` — this tab is only the everyday path to it for a licensed
  // operator checking days remaining or pasting a renewal ahead of expiry.
  { href: '/license', label: 'Lisans' },
  // doc 06 §10.4 — shown only with `users.manage`; the page refuses anyone else regardless.
  { href: '/settings/users', label: 'Kullanıcılar' },
  // Auto-update spec §5.3 — shown only with `settings.manage`; installing is an administrator's act.
  { href: '/settings/update', label: 'Güncelleme' },
];

/**
 * The seller module's settings tabs (fees, policy, product sources — `module-routes.ts`) are
 * hidden while that module is off (doc 17 §1.3). `sellerEnabled` is read on the server
 * (`SettingsNav`) so the first paint is already right: asking from here after mount drew every
 * tab and then removed three, on every tab click, since each settings page mounts its own bar.
 */
export function SettingsTabs({ sellerEnabled }: { sellerEnabled: boolean }) {
  const pathname = usePathname();
  const can = useCan();
  const tabs = TABS.filter((tab) => sellerEnabled || moduleForPath(tab.href) !== 'seller').filter(
    (tab) => tab.href !== '/settings/users' || can('users.manage'),
  ).filter((tab) => tab.href !== '/settings/update' || can('settings.manage'));
  return (
    // An underline tab bar; the tab you are on is announced (`aria-current`), not only drawn
    // differently (doc 15 rule 8).
    <nav aria-label="Ayarlar bölümleri" className="flex flex-wrap gap-x-1 border-b border-(--color-border)">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active
                ? 'border-(--color-accent) font-semibold text-(--color-text)'
                : 'border-transparent text-(--color-muted) hover:text-(--color-text)'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
