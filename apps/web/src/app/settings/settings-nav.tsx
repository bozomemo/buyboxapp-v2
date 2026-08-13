'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/settings/marketplaces', label: 'Pazaryerleri' },
  { href: '/settings/fees', label: 'Ücretler' },
  { href: '/settings/policy', label: 'Politika' },
  { href: '/settings/product-sources', label: 'Ürün Kaynakları' },
  { href: '/settings/retention', label: 'Saklama' },
  { href: '/settings/database', label: 'Veritabanı' },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-[var(--color-border)] pb-2">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={
            pathname === tab.href
              ? 'rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white'
              : 'rounded px-3 py-1.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface)]'
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
