'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/', label: 'Panel' },
  { href: '/stock', label: 'Stok' },
  { href: '/listings', label: 'İlanlar' },
  { href: '/competitors', label: 'Rakip Geçmişi' },
  { href: '/competitors/sellers', label: 'Rakip Satıcılar' },
  { href: '/alerts', label: 'Alarmlar' },
  { href: '/jobs', label: 'İşler' },
  { href: '/events', label: 'Olaylar' },
  { href: '/settings', label: 'Ayarlar' },
];

/**
 * The header's one-click-from-anywhere control (doc 06 §2, R-UI-9: "Kill switches are reachable
 * within one click from any screen"). This is the **system pause** — `/api/system-pause`, not
 * `/api/kill-switch`. It used to point at the price-submission switch under this same "Genel
 * Durdurma" name, which was the bug: the label promised "stop everything" but the control only
 * ever stopped price submission, so an operator engaging it (thinking it paused imports and
 * observation too) was, without realising it, only ever touching the narrower switch — and its
 * "AKTİF" state was shown in the alarm colour, red, which is backwards: **red should mean "the
 * risky thing is happening now"**, not "the system is safely stopped". Fixed 2026-08-14: this
 * button now controls the setting its name actually describes, and the colour follows risk —
 * muted while paused (the safe default), a plain "running" indicator once resumed. The
 * price-submission switch itself lives on the dashboard (`PriceSubmissionSwitch`), correctly
 * coloured the other way around, because *that* one's "on" state is the one worth alarming on.
 */
function SystemPauseButton() {
  const [engaged, setEngaged] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/system-pause')
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
    if (engaged) {
      // Resuming starts every job again — imports, buybox observation, decisions, and
      // (subject to its own separate switch) submissions.
      if (
        !window.confirm(
          'Sistemi devam ettirmek üzeresiniz. Tüm işler yeniden başlayacak. Emin misiniz?',
        )
      ) {
        return;
      }
    }
    setBusy(true);
    try {
      const next = !engaged;
      const res = await fetch('/api/system-pause', {
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
      title="Tüm işleri durdurur: içe aktarma, buybox gözlemi, karar hesaplama ve fiyat gönderimi. Fiyat gönderiminin kendi ayrı anahtarı panelde bulunur."
      className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
        engaged
          ? 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-slate-50'
          : 'bg-[var(--color-success)] text-white hover:opacity-90'
      }`}
    >
      {engaged ? 'Genel Durdurma: Duraklatıldı' : 'Sistem Çalışıyor'}
    </button>
  );
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSetup = pathname?.startsWith('/setup');
  // Longest prefix wins, rather than every prefix matching. `/competitors/sellers` is a child
  // path of `/competitors`, so a plain `startsWith` per item lights up both rows at once and
  // the sidebar stops telling you where you are.
  const activeHref =
    pathname === '/'
      ? '/'
      : NAV_ITEMS.filter((item) => item.href !== '/' && pathname?.startsWith(item.href))
          .sort((a, b) => b.href.length - a.href.length)[0]?.href;

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
            const active = item.href === activeHref;
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
          <SystemPauseButton />
        </header>
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}
