'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AppModule, EnabledModules } from '@buybox/shared';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bookmark,
  Cog,
  Eye,
  GitCompare,
  History,
  Icon,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Users,
  type LucideIcon,
} from '@/components/icon';
import { Ago, Chip, ConfirmButton, SegmentedFilter } from '@/components/ui';
import { readStoredNavCollapsed, storeNavCollapsed } from '@/lib/nav-collapse';
import { scanFreshness, type DashboardFreshnessInput } from '@/lib/scan-freshness';
import {
  NAV_VIEW_OPTIONS,
  readStoredNavView,
  showsViewSwitch,
  storeNavView,
  visibleModules,
  type ModulesState,
  type NavView,
} from '@/lib/nav-modules';
import { NO_PERMISSION_TITLE, PermissionsProvider, canToggleStop, useCan } from '@/lib/permissions';
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
 * **Hidden per module since 2026-09-19 (doc 17 §1.3).** This comment used to say the groups
 * were deliberately *not* hidden per install type, because a nav item that appears only after
 * some other screen has been used is a feature nobody finds. That holds for a feature; it does
 * not hold for a module somebody switched off in setup, and a brand manager wading through the
 * seller's pricing menus is exactly the confusion the brand module exists to remove. `module`
 * below is which module a group belongs to; `null` is shown to everyone.
 *
 * **Icons since 2026-11-03** (spec 2026-11-03-ui-redesign §5.2): every item carries one, which is
 * what the collapsed icon rail draws; the label stays the link's accessible name either way.
 */
const NAV_GROUPS: {
  readonly title: string | null;
  readonly module: AppModule | null;
  readonly items: { href: string; label: string; icon: LucideIcon }[];
}[] = [
  { title: null, module: null, items: [{ href: '/', label: 'Panel', icon: LayoutDashboard }] },
  {
    title: 'Satış',
    module: 'seller',
    items: [
      { href: '/stock', label: 'Stok', icon: Package },
      { href: '/listings', label: 'İlanlar', icon: Tags },
      { href: '/brands', label: 'Markalar', icon: Bookmark },
      { href: '/competitors', label: 'Rakip Geçmişi', icon: History },
      { href: '/competitors/sellers', label: 'Rakip Satıcılar', icon: Users },
      { href: '/alerts', label: 'Alarmlar', icon: Bell },
    ],
  },
  {
    title: 'Marka Denetimi',
    module: 'brand',
    items: [
      { href: '/brand/products', label: 'Stok', icon: Package },
      { href: '/brand/listings', label: 'İlanlar', icon: Tags },
      { href: '/watched-brands', label: 'İzlenen Markalar', icon: Eye },
      { href: '/tracked-products', label: 'Takip Edilen Ürünler', icon: ScanSearch },
      { href: '/watched-brands/sellers', label: 'Marka Satıcıları', icon: Store },
      { href: '/watched-brands/policy', label: 'Satıcı Politikası', icon: ShieldCheck },
      { href: '/watched-brands/findings', label: 'Denetim Bulguları', icon: AlertTriangle },
      { href: '/watched-brands/cross-marketplace', label: 'Pazaryeri Eşleşmesi', icon: GitCompare },
      { href: '/watched-brands/comparison', label: 'Marka Karşılaştırması', icon: BarChart3 },
    ],
  },
  {
    title: 'Sistem',
    module: null,
    items: [
      { href: '/jobs', label: 'İşler', icon: Cog },
      { href: '/events', label: 'Olaylar', icon: ScrollText },
      { href: '/settings', label: 'Ayarlar', icon: Settings },
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
  const can = useCan();

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
        className="h-9 rounded-lg border border-(--color-danger-border) bg-(--color-danger-bg) px-3 text-sm font-semibold text-(--color-danger) hover:opacity-90"
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
        disabled={busy || !canToggleStop(can, engaged)}
        title={
          canToggleStop(can, engaged)
            ? 'Tüm işleri durdurur: içe aktarma, buybox gözlemi, karar hesaplama ve fiyat gönderimi. Fiyat gönderiminin kendi ayrı anahtarı panelde bulunur.'
            : NO_PERMISSION_TITLE
        }
        className={`h-9 rounded-lg px-4 text-sm font-semibold transition disabled:opacity-50 ${
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

/**
 * The header's Satış / Marka / Tümü switch (doc 17 §1.1). Offered only when both modules are
 * installed, and a pure display preference — it hides a group, it never enables or stops
 * anything, which is why it can sit one click away beside the theme toggle.
 */
function ViewSwitch({ view, onChange }: { view: NavView; onChange: (view: NavView) => void }) {
  return <SegmentedFilter label="Menü görünümü" options={NAV_VIEW_OPTIONS} value={view} onChange={onChange} />;
}

/**
 * Each marketplace's last scan, at the left of the header (spec 2026-11-03-ui-redesign §5.3). Read
 * once per full page load from `/api/dashboard`, which already carries it; not polled, because
 * that route is the dashboard's whole payload. Says nothing while loading or on failure — the
 * dashboard is where a failed read is reported, and a header that errors on every page over a
 * secondary pill would be noise. A late scan says "gecikmeli" in the chip itself — the amber
 * tone alone would leave a stale scraper reading like a fresh one in greyscale or to a screen
 * reader (doc 15 rule 8).
 */
function ScanFreshness() {
  const [poll] = usePoll<DashboardFreshnessInput>('/api/dashboard');
  if (poll.status !== 'ready') return null;
  const entries = scanFreshness(poll.data);
  if (entries.length === 0) return null;
  return (
    <div className="mr-auto flex flex-wrap items-center gap-2">
      {entries.map((e) => (
        <Chip key={e.marketplaceCode} tone={e.tone} dot title={e.tone === 'warn' ? 'Son başarılı tarama gecikmeli' : undefined}>
          {e.label} · {e.tone === 'warn' && 'gecikmeli · '}
          <Ago at={e.at} never="henüz taranmadı" />
        </Chip>
      ))}
    </div>
  );
}

/** Rendered without the shell: doc 06 §10.1–§10.3. */
const STANDALONE_PREFIXES = ['/login', '/bootstrap', '/account/password', '/account/mfa-setup'];

interface Me {
  readonly user: { readonly displayName: string; readonly roleLabel: string; readonly permissions: readonly string[] };
}

/**
 * The signed-in user and _Çıkış yap_ (doc 06 §10.5). A failed read shows nothing rather than an
 * error: the proxy has already decided this browser is signed in, and the one way this poll
 * fails for a real reason — the session ended between page load and poll — sends the next click
 * to the sign-in screen anyway.
 */
function UserMenu({ collapsed }: { collapsed: boolean }) {
  const [poll] = usePoll<Me>('/api/auth/me');
  const [signingOut, setSigningOut] = useState(false);
  if (poll.status !== 'ready') return null;

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  const { displayName, roleLabel } = poll.data.user;
  const readOnly = !poll.data.user.permissions.some((p) => p !== 'view');
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('tr');

  // At the foot of the sidebar since 2026-11-03 (spec §5.2). In the rail only the initials and
  // the sign-out icon show; the name stays in the link for a screen reader.
  return (
    <div className={`flex items-center gap-2.5 rounded-lg bg-white/5 p-2.5 ${collapsed ? 'flex-col' : ''}`}>
      <Link href="/account" title="Hesabım" className="flex min-w-0 flex-1 items-center gap-2.5 text-sm hover:underline">
        <span
          aria-hidden="true"
          className="flex size-8 flex-none items-center justify-center rounded-full bg-(--color-sidebar-active-bg) text-xs font-bold text-(--color-sidebar-active-text)"
        >
          {initials}
        </span>
        <span className={collapsed ? 'sr-only' : 'min-w-0 leading-tight'}>
          <span className="block truncate font-semibold text-(--color-sidebar-strong)">{displayName}</span>
          <span className="block truncate text-xs text-(--color-sidebar-muted)">{roleLabel}</span>
        </span>
      </Link>
      {readOnly && !collapsed && (
        <span
          className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-(--color-sidebar-text)"
          title="Rolünüz yalnızca görüntülemeye izin veriyor; değişiklik yapamazsınız."
        >
          Salt okunur
        </span>
      )}
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        aria-label="Çıkış yap"
        title="Çıkış yap"
        className="flex size-8 flex-none items-center justify-center rounded-lg text-(--color-sidebar-text) hover:bg-white/10 disabled:opacity-50"
      >
        <Icon icon={LogOut} />
      </button>
    </div>
  );
}

/** What the sidebar's brand block names under "BuyBoxApp": the one module shown, else nothing. */
function moduleName(shown: { seller: boolean; brand: boolean }): string | null {
  if (shown.brand && !shown.seller) return 'Marka Denetimi';
  if (shown.seller && !shown.brand) return 'Satış';
  return null;
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSetup = pathname?.startsWith('/setup');
  const isStandalone = isSetup || STANDALONE_PREFIXES.some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`));
  const [modulesPoll] = usePoll<{ modules: EnabledModules }>('/api/modules');
  const modulesState: ModulesState =
    modulesPoll.status === 'ready'
      ? { status: 'ready', modules: modulesPoll.data.modules }
      : { status: modulesPoll.status };
  // Read after mount, like the theme: `localStorage` does not exist during the server render.
  const [view, setView] = useState<NavView>('all');
  // The icon rail (spec §5.2): the stored choice if there is one, otherwise collapsed on a viewport
  // narrower than 1024px. Read after mount for the same reason as the view.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setView(readStoredNavView());
    const stored = readStoredNavCollapsed();
    setCollapsed(
      stored ?? (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches),
    );
  }, []);
  const shown = visibleModules(modulesState, view);
  const groups = NAV_GROUPS.filter((group) => group.module === null || shown[group.module]);
  // Longest prefix wins, rather than every prefix matching. `/competitors/sellers` is a child
  // path of `/competitors`, so a plain `startsWith` per item lights up both rows at once and
  // the sidebar stops telling you where you are.
  const activeHref =
    pathname === '/'
      ? '/'
      : NAV_ITEMS.filter((item) => item.href !== '/' && pathname?.startsWith(item.href)).sort(
          (a, b) => b.href.length - a.href.length,
        )[0]?.href;

  if (isStandalone) {
    // The wizard is a full-bleed flow, not embedded in the operator's working shell; the sign-in
    // screens have nothing in the shell they could use (doc 06 §10.1).
    return <>{children}</>;
  }

  const subtitle = moduleName(shown);

  return (
    <PermissionsProvider>
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-0 flex h-screen flex-none flex-col bg-(--color-sidebar) py-4 transition-[width] ${
          collapsed ? 'w-16 px-2' : 'w-60 px-3'
        }`}
      >
        <div className={`mb-6 flex items-center gap-2.5 ${collapsed ? 'justify-center' : 'px-2'}`}>
          <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-(--color-accent) text-(--color-sidebar-strong)">
            <Icon icon={ShoppingBag} size={18} />
          </span>
          <span className={collapsed ? 'sr-only' : 'leading-tight'}>
            <span className="block text-[15px] font-bold text-(--color-sidebar-strong)">BuyBoxApp</span>
            {subtitle && <span className="block text-xs text-(--color-sidebar-muted)">{subtitle}</span>}
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {groups.map((group, index) => (
            <div key={group.title ?? 'root'} className={index === 0 ? '' : 'mt-4'}>
              {group.title && !collapsed && (
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-(--color-sidebar-muted)">
                  {group.title}
                </div>
              )}
              {group.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg py-2 text-sm ${collapsed ? 'justify-center px-0' : 'px-3'} ${
                      active
                        ? 'bg-(--color-sidebar-active-bg) font-semibold text-(--color-sidebar-active-text)'
                        : 'text-(--color-sidebar-text) hover:bg-white/5'
                    }`}
                  >
                    <Icon icon={item.icon} size={18} className="flex-none" />
                    <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-2">
          <UserMenu collapsed={collapsed} />
          {/* A plain button, not the kit's ghost `Button`: that variant's content ink would win
              over a sidebar-ink class by Tailwind's source order, not class order, and content ink
              on the navy sidebar is 1.08:1 in the light theme — the only control that opens the
              rail would be invisible. Same shape as the sign-out button above. */}
          <button
            type="button"
            aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            onClick={() => {
              setCollapsed(!collapsed);
              storeNavCollapsed(!collapsed);
            }}
            className={`flex size-8 items-center justify-center rounded-lg text-(--color-sidebar-text) hover:bg-white/10 ${
              collapsed ? 'self-center' : 'self-end'
            }`}
          >
            <Icon icon={collapsed ? PanelLeftOpen : PanelLeftClose} />
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <LicenseGraceBanner />
        <header className="flex items-center justify-end gap-3 border-b border-(--color-border) bg-(--color-surface) px-6 py-3">
          <ScanFreshness />
          {showsViewSwitch(modulesState) && (
            <ViewSwitch
              view={view}
              onChange={(next) => {
                setView(next);
                storeNavView(next);
              }}
            />
          )}
          <ThemeToggle />
          <SystemPauseButton />
        </header>
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
    </PermissionsProvider>
  );
}
