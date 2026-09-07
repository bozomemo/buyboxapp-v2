'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ConfirmButton } from '@/components/ui';
import { ThemeToggle } from './theme-toggle';

/**
 * One GET, three outcomes, for the two small polls this shell owns (doc 15 §6, Phase 7). Both
 * used to fold "the request failed" into the same `undefined` bucket as "nothing to show yet" —
 * `.catch(() => undefined)` — which was fine the day these routes could 500 before the setup
 * wizard had run, and stopped being fine once `NavShell` returns bare `children` for `/setup`
 * (below): by the time this chrome renders at all, the app is bootstrapped, so a failure here is
 * a real one (the API route threw, the network dropped), not "not configured yet". Swallowing it
 * left the operator looking at a header that quietly had no system-pause button and no licence
 * warning, with nothing said about why (doc 15 §3.2 Error: "never a silent `.catch(() => …)`").
 */
type Poll<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

function usePoll<T>(url: string): [Poll<T>, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [poll, setPoll] = useState<Poll<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setPoll({ status: 'loading' });
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T;
      })
      .then((data) => {
        if (!cancelled) setPoll({ status: 'ready', data });
      })
      .catch((e: unknown) => {
        if (!cancelled) setPoll({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
    // `attempt` has no other purpose than to force this effect to rerun on retry.
  }, [url, attempt]);

  return [poll, () => setAttempt((n) => n + 1)];
}

/**
 * The sidebar, in three groups (2026-09-03).
 *
 * It was one flat list of sixteen links, which was fine at eight and stopped being fine when the
 * brand-owner module added six of its own: *Marka Satıcıları* sat between *Takip Edilen Ürünler*
 * and *Satıcı Politikası*, two rows below *Rakip Satıcılar*, and the two answer different
 * questions for different people. Grouping them is the cheapest thing that makes the shape of
 * the product visible — **Satış** is what we sell, **Marka Denetimi** is what others sell of
 * ours, **Sistem** is the machinery.
 *
 * Deliberately not hidden per install type: an install can be both, the groups are not
 * mutually exclusive, and a nav item that appears only after some other screen has been used is
 * a feature nobody finds.
 */
const NAV_GROUPS: { readonly title: string | null; readonly items: { href: string; label: string }[] }[] = [
  { title: null, items: [{ href: '/', label: 'Panel' }] },
  {
    title: 'Satış',
    items: [
      { href: '/stock', label: 'Stok' },
      { href: '/listings', label: 'İlanlar' },
      { href: '/brands', label: 'Markalar' },
      { href: '/competitors', label: 'Rakip Geçmişi' },
      { href: '/competitors/sellers', label: 'Rakip Satıcılar' },
      { href: '/alerts', label: 'Alarmlar' },
    ],
  },
  {
    title: 'Marka Denetimi',
    items: [
      { href: '/watched-brands', label: 'İzlenen Markalar' },
      { href: '/tracked-products', label: 'Takip Edilen Ürünler' },
      { href: '/watched-brands/sellers', label: 'Marka Satıcıları' },
      { href: '/watched-brands/policy', label: 'Satıcı Politikası' },
      { href: '/watched-brands/findings', label: 'Denetim Bulguları' },
      { href: '/watched-brands/cross-marketplace', label: 'Pazaryeri Eşleşmesi' },
      { href: '/watched-brands/comparison', label: 'Marka Karşılaştırması' },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { href: '/jobs', label: 'İşler' },
      { href: '/events', label: 'Olaylar' },
      { href: '/settings', label: 'Ayarlar' },
    ],
  },
];

/** Flattened, for the active-route match below — which is about paths, not about grouping. */
const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

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
  const [poll, retry] = usePoll<{ engaged: boolean }>('/api/system-pause');
  const [busy, setBusy] = useState(false);
  const [toggleError, setToggleError] = useState<string | undefined>();

  if (poll.status === 'loading') {
    // A brief, unlabelled gap rather than a header that jumps as soon as the poll answers — this
    // is chrome that renders on every screen, not a primary load with its own dedicated space.
    return (
      <span aria-live="polite" className="text-sm text-(--color-muted)">
        Sistem durumu yükleniyor…
      </span>
    );
  }

  if (poll.status === 'error') {
    return (
      <button
        type="button"
        onClick={retry}
        title={poll.message}
        className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) px-3 py-1.5 text-sm font-semibold text-(--color-danger) hover:opacity-90"
      >
        Sistem durumu alınamadı — Tekrar dene
      </button>
    );
  }

  const engaged = poll.data.engaged;

  async function toggle() {
    setBusy(true);
    setToggleError(undefined);
    try {
      const next = !engaged;
      const res = await fetch('/api/system-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engaged: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      retry();
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {/* Resuming starts every job again — imports, buybox observation, decisions, and (subject
          to its own separate switch) submissions — so only that direction confirms. */}
      <ConfirmButton
        requireConfirm={engaged}
        confirmMessage="Sistemi devam ettirmek üzeresiniz. Tüm işler yeniden başlayacak. Emin misiniz?"
        onConfirmed={() => void toggle()}
        disabled={busy}
        title="Tüm işleri durdurur: içe aktarma, buybox gözlemi, karar hesaplama ve fiyat gönderimi. Fiyat gönderiminin kendi ayrı anahtarı panelde bulunur."
        className={`rounded px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
          engaged
            ? 'border border-(--color-border) bg-(--color-surface) text-(--color-text) hover:bg-(--color-hover)'
            : 'bg-(--color-success) text-(--color-success-ink) hover:opacity-90'
        }`}
      >
        {busy ? 'Uygulanıyor…' : engaged ? 'Genel Durdurma: Duraklatıldı' : 'Sistem Çalışıyor'}
      </ConfirmButton>
      {toggleError && (
        <span role="alert" className="text-xs text-(--color-danger)">
          Değiştirilemedi: {toggleError}
        </span>
      )}
    </span>
  );
}

/**
 * doc 13 §4.1: a lapsed licence inside its 7-day grace window still runs, but must say so
 * everywhere, not just on the `/license` screen — an operator working the dashboard should not
 * discover the system is about to stop only when it actually does. Silent on a `valid` licence,
 * because that is the common case and has nothing to say.
 *
 * `/api/license` GET never 404s — it answers before bootstrap too (doc 13 §6) — so the only
 * reason this poll can fail here, past the setup wizard, is a real one: the route threw, or the
 * request never reached it. That used to be folded into the same `undefined` as "licence is
 * fine, say nothing" via `.catch(() => undefined)`; an operator running past the grace window on
 * a broken poll got no warning at all. It now says so, with a retry, same as the system-pause
 * button above.
 */
function LicenseGraceBanner() {
  const [poll, retry] = usePoll<{ status: { state: string; graceDaysRemaining?: number } }>('/api/license');

  if (poll.status === 'loading') return null; // sub-second in practice; nothing worth saying yet

  if (poll.status === 'error') {
    return (
      <div className="border-b border-(--color-danger-border) bg-(--color-danger-bg) px-6 py-2 text-center text-sm text-(--color-danger)">
        Lisans durumu okunamadı: {poll.message}{' '}
        <button type="button" onClick={retry} className="font-semibold underline">
          Tekrar dene
        </button>
      </div>
    );
  }

  const daysRemaining = poll.data.status.state === 'grace' ? poll.data.status.graceDaysRemaining : undefined;
  if (daysRemaining === undefined) return null;

  return (
    <div className="border-b border-(--color-warning-border) bg-(--color-warning-bg) px-6 py-2 text-center text-sm text-(--color-warning)">
      Lisans süresi doldu. Sistem {daysRemaining} gün sonra duracak.{' '}
      <Link href="/license" className="font-semibold underline">
        Şimdi yenile
      </Link>
    </div>
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
      : NAV_ITEMS.filter((item) => item.href !== '/' && pathname?.startsWith(item.href)).sort(
          (a, b) => b.href.length - a.href.length,
        )[0]?.href;

  if (isSetup) {
    // The wizard is a full-bleed flow, not embedded in the operator's working shell.
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-none flex-col border-r border-(--color-border) bg-(--color-surface) p-4">
        <div className="mb-6 text-lg font-bold">BuyBoxApp</div>
        <nav className="flex flex-col gap-1">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.title ?? 'root'} className={index === 0 ? '' : 'mt-4'}>
              {group.title && (
                <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-(--color-muted)">
                  {group.title}
                </div>
              )}
              {group.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded px-3 py-2 text-sm ${
                      active
                        ? 'bg-(--color-accent) text-(--color-accent-ink)'
                        : 'text-(--color-text) hover:bg-(--color-hover)'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <LicenseGraceBanner />
        <header className="flex items-center justify-end gap-3 border-b border-(--color-border) bg-(--color-surface) px-6 py-3">
          <ThemeToggle />
          <SystemPauseButton />
        </header>
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}
