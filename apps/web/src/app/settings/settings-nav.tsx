'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { moduleForPath } from '@/lib/module-routes';

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
];

/**
 * The seller module's settings tabs (fees, policy, product sources — `module-routes.ts`) are
 * hidden while that module is off (doc 17 §1.3). Until the answer arrives, and if asking fails,
 * every tab is drawn: the proxy refuses a disabled module's page anyway, and a missing tab is
 * worse than one that redirects.
 */
export function SettingsNav() {
  const pathname = usePathname();
  const [sellerEnabled, setSellerEnabled] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/modules')
      .then((r) => (r.ok ? (r.json() as Promise<{ modules: { seller: boolean } }>) : undefined))
      .then((data) => {
        if (!cancelled && data) setSellerEnabled(data.modules.seller);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const tabs = TABS.filter((tab) => sellerEnabled || moduleForPath(tab.href) !== 'seller');
  return (
    <nav className="flex flex-wrap gap-1 border-b border-(--color-border) pb-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={
            pathname === tab.href
              ? 'rounded bg-(--color-accent) px-3 py-1.5 text-sm font-medium text-(--color-accent-ink)'
              : 'rounded px-3 py-1.5 text-sm text-(--color-muted) hover:bg-(--color-surface)'
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
