'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/', label: 'Panel' },
  { href: '/stock', label: 'Stok' },
  { href: '/listings', label: 'İlanlar' },
  { href: '/competitors', label: 'Rakip Geçmişi' },
  { href: '/jobs', label: 'İşler' },
  { href: '/events', label: 'Olaylar' },
  { href: '/settings', label: 'Ayarlar' },
];

function KillSwitch() {
  const [engaged, setEngaged] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/kill-switch')
      .then((res) => (res.ok ? res.json() : undefined))
      .then((data: { engaged: boolean } | undefined) => {
        if (!cancelled && data) setEngaged(data.engaged);
      })
      .catch(() => undefined); // not configured yet (setup wizard not run) — stay hidden
    return () => {
      cancelled = true;
    };
  }, []);

  if (engaged === undefined) return null;

  async function toggle() {
    setBusy(true);
    try {
      const next = !engaged;
      const res = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engaged: next }),
      });
      if (res.ok) setEngaged(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      title="Tüm marketyerlerinde fiyat gönderimini anında durdurur"
      className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
        engaged
          ? 'bg-[var(--color-danger)] text-white hover:opacity-90'
          : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-slate-50'
      }`}
    >
      {engaged ? 'Genel Durdurma: AKTİF' : 'Genel Durdurma'}
    </button>
  );
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSetup = pathname?.startsWith('/setup');

  if (isSetup) {
    // The wizard is a full-bleed flow, not embedded in the operator's working shell.
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-none flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-6 text-lg font-bold">BuyBoxApp</div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-2 text-sm ${
                  active
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-[var(--color-text)] hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3">
          <KillSwitch />
        </header>
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}
