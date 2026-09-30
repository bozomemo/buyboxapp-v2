'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Ago, Chip, ConfirmButton, Section, Tone, TONE_BOX, TONE_TEXT } from '@/components/ui';
import { PriceChart } from '@/components/price-chart';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import { formatDateTime, formatMoney, formatNumber, formatTime } from '@/lib/format';
import {
  DECISION_REASON_LABELS,
  labelOf,
  PHASE_DESCRIPTIONS,
  PHASE_LABELS,
  SUBMISSION_STATE_LABELS,
} from '@/lib/labels';
import { NO_PERMISSION_TITLE, canToggleStop, useCan } from '@/lib/permissions';

/**
 * The dashboard (doc 06 §2). Its one job is to answer, at a glance, the question the spec states
 * verbatim — **"is it working, and is it safe?"** — and, when the answer is no, to say what to do
 * about it.
 *
 * Rebuilt 2026-09-05 around that question rather than around the aggregate feed's shape. Each of
 * the changes below removes a step of reasoning the old screen left to the operator:
 *
 * 1. **A verdict, not six sections to synthesise.** Kill switches, budgets, phase counts, alerts
 *    and a log sat side by side at equal weight and the operator combined them in their head.
 *    `buildVerdict` states the conclusion; `buildAttention` lists what to act on, each row
 *    carrying the one link that acts on it.
 * 2. **The worker is on the screen.** The panel could read "Sistem Çalışıyor" while the worker
 *    process was dead or pointed at a different database — the exact failure `worker-status.ts`
 *    exists to make visible, and it was one screen away on `/jobs`. The dashboard now reads
 *    `/api/health` alongside the aggregate and folds its (already Turkish) warnings in.
 * 3. **One system-pause control, not two.** The header carries it, one click from anywhere
 *    (R-UI-9, `nav-shell.tsx`); the dashboard duplicated it as the heaviest element on the page,
 *    with a second, differently-worded confirmation. Here it is a state readout pointing at the
 *    control that changes it. The *price-submission* switch stays operable here — it lives
 *    nowhere else.
 * 4. **Turkish, not enum values.** `queued`/`confirmed` and the core's English `explanation` were
 *    printed raw (R-UI-11). Both now go through `lib/labels.ts`, shared with the listing detail
 *    so the two screens cannot drift.
 * 5. **Relative times.** "5.09.2026 14:03:12" makes the operator compute staleness; "14dk önce"
 *    does not. The absolute timestamp stays in the `title`.
 * 6. **Progressive disclosure.** Brand-audit detail and the raw event log are `<details>`,
 *    closed. The summary numbers above them stay visible.
 *
 * Deliberately *not* changed: the aggregate route, and the rule that the brand section is drawn
 * only when something is watched — a pure repricing install sees no brand section at all.
 */

interface MarketplaceInfo {
  code: string;
  displayName: string;
  enabled: boolean;
  killSwitchEngaged: boolean;
  automationEnabled: boolean;
  budget: { consumed: number; allowance: number; reservePct: number } | null;
  health: {
    lastImportAt: number | null;
    lastBuyboxObservationAt: number | null;
    reachable: boolean | null;
    scrapeFailureRatePct: number | null;
  };
}

interface AppEvent {
  id: string;
  at: number;
  level: string;
  marketplaceCode: string | null;
  listingId: string | null;
  code: string;
  message: string;
}

interface Decision {
  id: string;
  listingId: string;
  marketplaceCode: string;
  productName: string;
  oldPrice: string;
  newPrice: string;
  reason: string;
  explanation: string;
  state: string;
  decidedAt: number;
}

/** Marka sahibi tarafı. `null` — hiç izlenen marka yok — saf repricing kurulumunun normali. */
interface BrandAudit {
  windowMs: number;
  openFindings: { stated: number; measured: number };
  brands: {
    id: string;
    label: string;
    marketplaceCode: string;
    productCount: number;
    noSellerCount: number;
    neverLookedCount: number;
    openFindings: number;
    lastSweptAt: number | null;
  }[];
  referencePrice: { productsWithPrice: number; productsTotal: number };
  /** Kuruş, dizge olarak. `null` bir gün: o gün okunabilir fiyat yoktu — sıfır değil. */
  trend: {
    dayMs: number;
    avgPrice: string | null;
    sellerCount: number;
    productsWithOffers: number;
    productsWithoutOffers: number;
  }[];
}

interface DashboardData {
  /** Absent from a server older than doc 17 — read as both enabled, which is what that server ran. */
  modules?: { seller: boolean; brand: boolean };
  brandAudit: BrandAudit | null;
  /** The "stop everything" control — genuinely separate from `globalKillSwitchEngaged` below. */
  systemPaused: boolean;
  /** The narrower price-submission-only control. Neither state is derived from the other. */
  globalKillSwitchEngaged: boolean;
  marketplaces: MarketplaceInfo[];
  phaseDistribution: Record<string, number>;
  competitorAlerts: {
    open: number;
    coverage: { marketplaceCode: string; displayName: string; lastOkAt: number | null; stale: boolean }[];
    staleMarketplaces: string[];
  };
  /**
   * The last 20 `app_events` rows at `warn` and above. A log tail, **not** the open-alert list —
   * see `EventLogSection` for why the distinction had to be made visible.
   */
  alerts: AppEvent[];
  recentDecisions: Decision[];
}

/** The part of `/api/health` this screen needs. That route always answers 200 and explains in the body. */
interface HealthData {
  status: 'ok' | 'degraded';
  database: { configured: boolean; reachable: boolean; schema?: { drift: string }; error?: string };
  worker: { running: boolean; msSinceLastTick?: number; lastTickOutcome?: string; databaseTarget?: string };
  warnings: string[];
}

const PHASES = ['SEEKING', 'CLIMBING', 'REFINING', 'OPTIMUM', 'BLOCKED'] as const;

/**
 * The phases that mean a person should look. Kept as a set rather than a `=== 'BLOCKED'` so the
 * day a second phase earns the same weight is a one-line change here and nowhere else.
 */
const PROBLEM_PHASES = new Set<string>(['BLOCKED']);

// --- Verdict and attention ------------------------------------------------------------------

interface Attention {
  id: string;
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
}

/**
 * Everything that needs a person, in the order a person should deal with it.
 *
 * The admission rule: an operator could act on it *today*, and the system will not fix it by
 * itself. A budget at 70% is not on this list; a budget that is spent is. Automation switched off
 * is not a fault but a choice, so it is reported on the marketplace row rather than here — a list
 * that cries about deliberate configuration is a list people stop reading.
 */
function buildAttention(data: DashboardData, health: HealthData | undefined): Attention[] {
  const items: Attention[] = [];
  // The seller's warnings — our listings' scrape, our alerts, our budget, our decisions — say
  // nothing to an install that has the seller module off, and a stale-scrape warning about a job
  // that is not supposed to run would be permanently, falsely red (doc 17 §1.3).
  const seller = data.modules?.seller ?? true;

  if (health && health.database.configured && !health.database.reachable) {
    items.push({
      id: 'db-unreachable',
      severity: 'danger',
      title: 'Veritabanına ulaşılamıyor',
      detail: health.database.error ?? 'Bağlantı kurulamadı — hiçbir iş çalışamaz.',
      href: '/settings/database',
      hrefLabel: 'Veritabanı ayarları',
    });
  }
  if (health?.database.schema && health.database.schema.drift !== 'up-to-date') {
    items.push({
      id: 'db-drift',
      severity: 'danger',
      title: 'Veritabanı şeması bu sürümle uyuşmuyor',
      detail: 'Bekleyen göçler var. Uygulanana kadar işler beklenmedik şekilde başarısız olabilir.',
      href: '/settings/database',
      hrefLabel: 'Göçleri uygula',
    });
  }
  // The worker: the failure this dashboard was blind to. `running: false` is only a fault in the
  // shipped single-process topology (doc 10 §1.1) — a split deployment hosts the worker elsewhere
  // and correctly reports false here — which is why the row says where to confirm rather than
  // asserting the process is dead. Suppressed while the system is paused: nothing running is then
  // the expected state, and repeating it is noise.
  if (health && !health.worker.running && !data.systemPaused) {
    items.push({
      id: 'worker-down',
      severity: 'danger',
      title: 'Worker çalışmıyor',
      detail: seller
        ? 'Kuyruktaki işleri alacak kimse yok — fiyat hesaplanmıyor ve gönderilmiyor.'
        : 'Kuyruktaki işleri alacak kimse yok — markalar taranmıyor.',
      href: '/jobs',
      hrefLabel: 'İşler ekranı',
    });
  }
  // `/api/health`'s own warnings are already operator-facing Turkish sentences, and each one is a
  // condition that has silently held the whole queue at least once (a worker on the wrong
  // database, a worker that stopped ticking, an enabled marketplace with no adapter). Passed
  // through verbatim rather than re-worded, so this screen and `/jobs` cannot disagree.
  for (const [i, warning] of (health?.warnings ?? []).entries()) {
    items.push({
      id: `health-${i}`,
      severity: 'danger',
      title: 'Sistem uyarısı',
      detail: warning,
      href: '/jobs',
      hrefLabel: 'İşler ekranı',
    });
  }

  if (data.marketplaces.length === 0) {
    items.push({
      id: 'no-marketplaces',
      severity: 'danger',
      title: 'Etkin pazaryeri yok',
      detail: seller
        ? 'Hiçbir pazaryeri açık değil, dolayısıyla fiyatlandırılacak ilan da yok.'
        : 'Hiçbir pazaryeri açık değil, dolayısıyla taranacak marka da yok.',
      href: '/settings/marketplaces',
      hrefLabel: 'Pazaryeri ekle',
    });
  }

  // Stale scraping above the open-alert count, deliberately: zero open alerts behind a scraper
  // that has not succeeded in a day means "we have not looked", and that reads as "nothing is
  // wrong" unless something says otherwise first.
  if (seller && data.competitorAlerts.staleMarketplaces.length > 0) {
    items.push({
      id: 'stale-scrape',
      severity: 'warning',
      title: 'Rakip verisi bayat',
      detail: `${data.competitorAlerts.staleMarketplaces.join(', ')} için son başarılı taramanın üzerinden çok geçti. Alarm görünmemesi “sorun yok” anlamına gelmez.`,
      href: '/jobs',
      hrefLabel: 'Tarama işleri',
    });
  }
  if (seller && data.competitorAlerts.open > 0) {
    items.push({
      id: 'open-alerts',
      severity: 'warning',
      title: `${formatNumber(data.competitorAlerts.open)} açık rakip alarmı`,
      detail: 'Kurduğunuz kurallardan biri veya birkaçı tetiklendi ve hâlâ açık.',
      href: '/alerts',
      hrefLabel: 'Alarmları incele',
    });
  }

  for (const m of seller ? data.marketplaces : []) {
    if (!m.budget) continue;
    if (m.budget.allowance - m.budget.consumed <= 0) {
      items.push({
        id: `budget-${m.code}`,
        severity: 'warning',
        title: `${m.displayName}: günlük güncelleme bütçesi doldu`,
        detail: 'Bugün başka fiyat gönderilmeyecek. Gerekiyorsa politika ayarından yükseltin.',
        href: '/settings/policy',
        hrefLabel: 'Politika ayarları',
      });
    }
  }

  // Failures in the decision feed. Scoped honestly: this counts the last N decisions the
  // aggregate returns, not all of history, and the sentence says "son kararların" so the number
  // cannot be read as a total.
  const failed = data.recentDecisions.filter((d) => d.state === 'failed' || d.state === 'rejected');
  if (seller && failed.length > 0) {
    items.push({
      id: 'failed-submissions',
      severity: 'warning',
      title: `Son kararların ${formatNumber(failed.length)} tanesi pazaryerine geçmedi`,
      detail: 'Fiyat hesaplandı ama gönderim başarısız oldu veya reddedildi. Sebebi olay günlüğünde.',
      href: '/events',
      hrefLabel: 'Olay günlüğü',
    });
  }

  const blocked = data.phaseDistribution.BLOCKED ?? 0;
  if (seller && blocked > 0) {
    items.push({
      id: 'blocked',
      severity: 'warning',
      title: `${formatNumber(blocked)} ilan bloke`,
      detail:
        'Bu ilanlar için kârlı bir fiyat mümkün değil — maliyet, komisyon veya ayarlanan bir sınır engelliyor.',
      href: '/listings?phases=BLOCKED',
      hrefLabel: 'Bloke ilanlar',
    });
  }

  return items;
}

interface Verdict {
  tone: Tone;
  headline: string;
  detail: string;
}

/** The one sentence this screen exists to produce. */
function buildVerdict(data: DashboardData, attention: Attention[]): Verdict {
  const critical = attention.filter((a) => a.severity === 'danger').length;
  // Every sentence below is about prices unless the seller module is on to have any (doc 17 §1):
  // a brand-only install told "fiyatlandırma ilerlemiyor" is being told about something it never
  // had.
  const seller = data.modules?.seller ?? true;

  // Checked first: a paused system is not broken, and reporting "nothing is running" as a fault
  // would alarm an operator who paused it on purpose thirty seconds ago.
  if (data.systemPaused) {
    return {
      tone: 'neutral',
      headline: 'Sistem duraklatıldı',
      detail: seller
        ? 'İçe aktarma, buybox gözlemi, karar hesaplama ve fiyat gönderimi dahil hiçbir iş çalışmıyor. Bu, sistemin varsayılan güvenli durumudur — üst çubuktaki düğmeyle devam ettirebilirsiniz.'
        : 'Katalog ve satıcı taramaları dahil hiçbir iş çalışmıyor. Üst çubuktaki düğmeyle devam ettirebilirsiniz.',
    };
  }
  if (critical > 0) {
    return {
      tone: 'danger',
      headline:
        critical === 1
          ? 'Sistem düzgün çalışmıyor'
          : `Sistem düzgün çalışmıyor — ${formatNumber(critical)} sorun`,
      detail: seller
        ? 'Aşağıdakiler giderilene kadar fiyatlandırma güvenilir şekilde ilerlemiyor.'
        : 'Aşağıdakiler giderilene kadar marka taramaları güvenilir şekilde ilerlemiyor.',
    };
  }
  if (attention.length > 0) {
    return {
      tone: 'warn',
      headline: `Çalışıyor — bakılması gereken ${formatNumber(attention.length)} konu var`,
      detail: 'Sistem ilerliyor, ancak aşağıdakiler ilginizi bekliyor.',
    };
  }
  return {
    tone: 'ok',
    headline: 'Her şey yolunda',
    detail: !seller
      ? 'İşler çalışıyor ve müdahale gerektiren bir şey yok.'
      : data.globalKillSwitchEngaged
        ? 'İşler çalışıyor ve müdahale gerektiren bir şey yok. Fiyat gönderimi kapalı olduğu için hesaplanan fiyatlar pazaryerlerine gitmiyor.'
        : 'İşler çalışıyor, fiyatlar gönderiliyor ve müdahale gerektiren bir şey yok.',
  };
}

function VerdictBanner({
  verdict,
  data,
  health,
  lastLoadedAt,
  onRefresh,
  refreshing,
}: {
  verdict: Verdict;
  data: DashboardData;
  health: HealthData | undefined;
  lastLoadedAt: number;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    // aria-live: the screen re-reads itself every 30s and the verdict can flip without anyone
    // touching anything. `polite` announces that without interrupting.
    <div aria-live="polite" className={`rounded border p-4 ${TONE_BOX[verdict.tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            className={`text-xl font-semibold ${verdict.tone === 'neutral' ? '' : TONE_TEXT[verdict.tone]}`}
          >
            {verdict.headline}
          </h1>
          <p className="mt-1 max-w-2xl text-sm">{verdict.detail}</p>
        </div>
        <div className="flex flex-none items-center gap-2 text-xs text-(--color-muted)">
          <span title={formatDateTime(lastLoadedAt)}>Son güncelleme {formatTime(lastLoadedAt)}</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 hover:bg-(--color-hover) disabled:opacity-50"
          >
            {refreshing ? 'Yenileniyor…' : 'Yenile'}
          </button>
        </div>
      </div>

      {/* The states that together answer "is it safe?", always all shown: each is misleading
          without the others. "İşler çalışıyor" alone says nothing about whether money is moving,
          and neither says anything if the worker is not ticking. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone={data.systemPaused ? 'neutral' : 'ok'}>
          İşler: {data.systemPaused ? 'duraklatıldı' : 'çalışıyor'}
        </Chip>
        {(data.modules?.seller ?? true) && (
          <Chip tone={data.globalKillSwitchEngaged ? 'neutral' : 'warn'}>
            Fiyat gönderimi: {data.globalKillSwitchEngaged ? 'kapalı' : 'AÇIK'}
          </Chip>
        )}
        {health && (
          <Chip
            tone={health.worker.running ? 'ok' : 'danger'}
            title={
              health.worker.databaseTarget ? `Worker veritabanı: ${health.worker.databaseTarget}` : undefined
            }
          >
            Worker: {health.worker.running ? 'çalışıyor' : 'durmuş'}
          </Chip>
        )}
      </div>
    </div>
  );
}

function AttentionList({ items }: { items: Attention[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded border border-(--color-border) bg-(--color-surface) p-4 text-sm text-(--color-muted)">
        Şu an müdahale gerektiren bir şey yok.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className={`flex flex-wrap items-start justify-between gap-3 rounded border p-3 ${
            item.severity === 'danger' ? TONE_BOX.danger : TONE_BOX.warn
          }`}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={item.severity === 'danger' ? 'danger' : 'warn'}>
                {item.severity === 'danger' ? 'Sorun' : 'Dikkat'}
              </Chip>
              <span className="font-semibold">{item.title}</span>
            </div>
            <p className="mt-1 text-sm">{item.detail}</p>
          </div>
          {item.href && (
            <Link
              href={item.href}
              className="flex-none rounded border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-sm font-semibold hover:bg-(--color-hover)"
            >
              {item.hrefLabel ?? 'Aç'} →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

// --- Safety controls ------------------------------------------------------------------------

/**
 * The **price-submission** switch (doc 06 §2, R-UI-9) — narrower than the system pause and
 * deliberately so: while engaged, every *other* job keeps running (imports, buybox observation,
 * decisions) but `SubmitPriceChanges` never calls a marketplace adapter.
 *
 * Fail-closed at the API level (`@buybox/shared`): a fresh install reports `engaged: true` with no
 * setting ever written, so this renders "kapalı" by default, not "açık" — there is nothing to
 * disengage accidentally. Only the direction that lets real money move asks for confirmation;
 * closing it stays one click, because the safe direction must never be the slow one.
 */
function PriceSubmissionSwitch({ engaged, onChanged }: { engaged: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const allowed = canToggleStop(useCan(), engaged);
  const [error, setError] = useState<string | undefined>();

  async function setEngaged(next: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engaged: next }),
      });
      // The old switch fired and refreshed regardless of the response, so a rejected write left
      // the button looking like it had worked until the next poll quietly moved it back.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded border p-4 ${engaged ? TONE_BOX.neutral : TONE_BOX.warn}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">
            Fiyat gönderimi {engaged ? 'kapalı' : 'açık — gerçek fiyat gönderiliyor'}
          </div>
          <p className="mt-1 max-w-xl text-sm text-(--color-muted)">
            {engaged
              ? 'Fiyatlar hesaplanıyor ama hiçbir pazaryerine gönderilmiyor. Sistemin varsayılan güvenli durumudur.'
              : 'Uygun ilanlar için gerçek fiyat güncellemeleri pazaryerlerine gidiyor.'}
          </p>
        </div>
        <ConfirmButton
          requireConfirm={engaged}
          confirmMessage="Fiyat gönderimini açmak üzeresiniz. Bundan sonra uygun ilanlar için gerçek fiyat güncellemeleri pazaryerlerine gönderilebilir. Emin misiniz?"
          onConfirmed={() => void setEngaged(!engaged)}
          disabled={busy || !allowed}
          {...(allowed ? {} : { title: NO_PERMISSION_TITLE })}
          className={`flex-none rounded px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
            engaged
              ? 'border border-(--color-border) bg-(--color-surface) hover:bg-(--color-hover)'
              : 'bg-(--color-danger) text-(--color-danger-ink) hover:opacity-90'
          }`}
        >
          {busy ? 'Uygulanıyor…' : engaged ? 'Fiyat gönderimini aç' : 'Fiyat gönderimini durdur'}
        </ConfirmButton>
      </div>
      {error && <p className="mt-2 text-sm text-(--color-danger)">Değiştirilemedi: {error}</p>}
    </div>
  );
}

/**
 * The system pause is **read-only here**. It already sits in the header, one click from every
 * screen (R-UI-9, `nav-shell.tsx`); a second copy of it as the largest control on the dashboard
 * meant one setting with two buttons and two different confirmation wordings, which is how an
 * operator ends up unsure which one they just used. This states what it is and says where it
 * lives.
 */
function SystemPauseState({ paused, seller }: { paused: boolean; seller: boolean }) {
  return (
    <div className={`rounded border p-4 ${TONE_BOX.neutral}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">Genel durdurma {paused ? 'açık' : 'kapalı'}</div>
          <p className="mt-1 max-w-xl text-sm text-(--color-muted)">
            {!seller
              ? paused
                ? 'Katalog ve satıcı taramaları dahil hiçbir iş çalışmıyor.'
                : 'İşler normal şekilde çalışıyor.'
              : paused
                ? 'İçe aktarma, buybox gözlemi, karar hesaplama ve fiyat gönderimi dahil hiçbir iş çalışmıyor.'
                : 'İşler normal şekilde çalışıyor. Fiyat gönderimi bundan ayrı, yandaki anahtarla kontrol edilir.'}
          </p>
        </div>
        <span className="flex-none text-xs text-(--color-muted)">Üst çubuktaki düğmeden değiştirilir ↗</span>
      </div>
    </div>
  );
}

// --- Marketplaces ---------------------------------------------------------------------------

function budgetTone(consumed: number, allowance: number, reservePct: number): Tone {
  if (allowance <= 0) return 'neutral';
  const remaining = allowance - consumed;
  if (remaining <= 0) return 'danger';
  if (remaining <= allowance * (reservePct / 100)) return 'warn';
  return 'ok';
}

const BUDGET_BAR: Record<Tone, string> = {
  ok: 'bg-(--color-success)',
  warn: 'bg-(--color-warning)',
  danger: 'bg-(--color-danger)',
  neutral: 'bg-(--color-chip-bg)',
};

function MarketplaceCard({
  marketplace,
  coverage,
  onChanged,
}: {
  marketplace: MarketplaceInfo;
  coverage: DashboardData['competitorAlerts']['coverage'][number] | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const m = marketplace;
  const allowed = canToggleStop(useCan(), m.killSwitchEngaged);

  async function toggleKillSwitch() {
    setBusy(true);
    try {
      await fetch('/api/kill-switch/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceCode: m.code, engaged: !m.killSwitchEngaged }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const bTone = m.budget ? budgetTone(m.budget.consumed, m.budget.allowance, m.budget.reservePct) : 'neutral';
  const remaining = m.budget ? Math.max(0, m.budget.allowance - m.budget.consumed) : null;

  return (
    <div className="rounded border border-(--color-border) bg-(--color-surface) p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{m.displayName}</span>
        <div className="flex items-center gap-2">
          {/* State and action are two different things. The old control was one button whose
              label was the state, so "Aktif" could be read either as what it is or as what
              clicking it does — on a control that stops every price going to a marketplace. */}
          <Chip tone={m.killSwitchEngaged ? 'neutral' : 'ok'}>
            {m.killSwitchEngaged ? 'Gönderim durduruldu' : 'Gönderim açık'}
          </Chip>
          {/* Confirmation only in the direction that lets real prices move again. Stopping stays
              a single click — an operator reaching for it usually has a reason to hurry, and a
              confirm on the safe direction trains people to click through the one that matters. */}
          <ConfirmButton
            requireConfirm={m.killSwitchEngaged}
            confirmMessage={`${m.displayName} için fiyat gönderimini açmak üzeresiniz. Bu pazaryerine gerçek fiyat güncellemeleri gönderilebilir. Emin misiniz?`}
            onConfirmed={() => void toggleKillSwitch()}
            disabled={busy || !allowed}
            {...(allowed ? {} : { title: NO_PERMISSION_TITLE })}
            aria-label={
              m.killSwitchEngaged
                ? `${m.displayName} için fiyat gönderimini aç`
                : `${m.displayName} için fiyat gönderimini durdur`
            }
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-50"
          >
            {busy ? '…' : m.killSwitchEngaged ? 'Aç' : 'Durdur'}
          </ConfirmButton>
        </div>
      </div>

      {m.budget ? (
        <div className="mb-3">
          <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs">
            {/* Remaining, not consumed, in the emphasised position: the operator's question is
                "can it still change prices today?". The raw ratio stays underneath. */}
            <span className="text-(--color-muted)">Bugünkü güncelleme bütçesi</span>
            <span className={`font-semibold ${TONE_TEXT[bTone]}`}>
              {remaining === 0 ? 'doldu' : `${formatNumber(remaining)} güncelleme kaldı`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={m.budget.allowance}
            aria-valuenow={m.budget.consumed}
            aria-valuetext={`${formatNumber(m.budget.allowance)} güncellemenin ${formatNumber(m.budget.consumed)} tanesi kullanıldı`}
            aria-label={`${m.displayName} güncelleme bütçesi`}
            className="h-2 w-full overflow-hidden rounded bg-(--color-border)"
          >
            <div
              className={`h-full ${BUDGET_BAR[bTone]}`}
              style={{
                width: `${Math.min(100, (m.budget.consumed / Math.max(1, m.budget.allowance)) * 100)}%`,
              }}
            />
          </div>
          <div className="mt-1 text-xs text-(--color-muted)">
            {formatNumber(m.budget.consumed)} / {formatNumber(m.budget.allowance)} kullanıldı
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs text-(--color-muted)">Bugün için bütçe henüz sıfırlanmadı.</p>
      )}

      {/* Only the health signals this process can actually see. The old card also carried a
          permanent "Erişilebilirlik / kazınma hata oranı: bilinmiyor" row — the circuit-breaker
          state lives in the worker's memory, per the aggregate route's header note — which took a
          line on every card and never once carried information. */}
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-(--color-muted)">Otomasyon</dt>
          <dd>
            {m.automationEnabled ? (
              'açık'
            ) : (
              <span className="text-(--color-muted)">kapalı — fiyat hesaplanmıyor</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-(--color-muted)">Son içe aktarım</dt>
          <dd>
            <Ago at={m.health.lastImportAt} never="hiç yapılmadı" />
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-(--color-muted)">Son buybox gözlemi</dt>
          <dd>
            <Ago at={m.health.lastBuyboxObservationAt} never="hiç yapılmadı" />
          </dd>
        </div>
        {coverage && (
          <div className="flex justify-between gap-2">
            <dt className="text-(--color-muted)">Son rakip taraması</dt>
            <dd className={coverage.stale ? `font-medium ${TONE_TEXT.danger}` : ''}>
              {coverage.lastOkAt === null ? (
                'son 7 günde yok'
              ) : (
                <>
                  <Ago at={coverage.lastOkAt} />
                  {coverage.stale && ' — bayat'}
                </>
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// --- Phases ---------------------------------------------------------------------------------

/**
 * Phase counts, each a link into the grid filtered to that phase (§4.5's cross-navigation
 * pattern, the same one `/brands` uses). The old tiles were five identical boxes with no way out:
 * an operator who read "12 Bloke" had to go to `/listings` and rebuild the filter by hand to find
 * out which twelve — and `BLOCKED` was drawn in exactly the weight of `OPTIMUM`, so the one count
 * that means "something is wrong" looked like the one that means "nothing is".
 */
function PhaseTiles({ distribution }: { distribution: Record<string, number> }) {
  const total = PHASES.reduce((sum, p) => sum + (distribution[p] ?? 0), 0);
  if (total === 0) {
    return (
      <p className="rounded border border-(--color-border) bg-(--color-surface) p-4 text-sm text-(--color-muted)">
        Henüz fiyatlandırılan ilan yok. İlanlar içe aktarıldıktan ve otomasyon açıldıktan sonra burası dolar.
      </p>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PHASES.map((phase) => {
          const count = distribution[phase] ?? 0;
          const problem = PROBLEM_PHASES.has(phase) && count > 0;
          return (
            <Link
              key={phase}
              href={`/listings?phases=${phase}`}
              title={PHASE_DESCRIPTIONS[phase]}
              className={`rounded border p-3 text-center hover:bg-(--color-hover) ${
                problem ? TONE_BOX.warn : 'border-(--color-border) bg-(--color-surface)'
              }`}
            >
              <div className={`tabular-figures text-2xl font-bold ${problem ? TONE_TEXT.warn : ''}`}>
                {formatNumber(count)}
              </div>
              <div className="text-xs text-(--color-muted)">{PHASE_LABELS[phase]}</div>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-(--color-muted)">
        {formatNumber(distribution.OPTIMUM ?? 0)} ilan en kârlı fiyatında — {formatNumber(total)} ilanın %
        {Math.round(((distribution.OPTIMUM ?? 0) / total) * 100)}’i. Sağlıklı bir sistemde bu oran yüksektir.
      </p>
    </>
  );
}

// --- Decisions ------------------------------------------------------------------------------

const DECISION_STATE_TONE: Record<string, Tone> = {
  confirmed: 'ok',
  submitted: 'neutral',
  queued: 'neutral',
  failed: 'danger',
  rejected: 'danger',
  cancelled: 'neutral',
};

/**
 * The last N price changes.
 *
 * No pager: the aggregate returns 15 rows and the old screen wrapped them in a 25-per-page
 * control that could never page — a dead control reads as a promise that there is more behind it.
 * The link to the full history is the honest version of that promise.
 */
function DecisionsTable({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) {
    return (
      <p className="rounded border border-(--color-border) bg-(--color-surface) p-4 text-sm text-(--color-muted)">
        Henüz fiyat değişikliği yapılmadı.
      </p>
    );
  }
  return (
    <TableFrame maxHeight="50vh">
      <table className="w-full text-sm">
        <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
          <tr>
            <th scope="col" className="px-3 py-2">
              Ürün
            </th>
            <th scope="col" className="px-3 py-2">
              Fiyat
            </th>
            <th scope="col" className="px-3 py-2">
              Neden
            </th>
            <th scope="col" className="px-3 py-2">
              Sonuç
            </th>
            <th scope="col" className="px-3 py-2">
              Ne zaman
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--color-border)">
          {decisions.map((d) => {
            const oldPrice = BigInt(d.oldPrice);
            const newPrice = BigInt(d.newPrice);
            const direction = newPrice > oldPrice ? '▲' : newPrice < oldPrice ? '▼' : '=';
            return (
              <tr key={d.id}>
                <td className="px-3 py-2">
                  <Link className="text-(--color-accent) hover:underline" href={`/listings/${d.listingId}`}>
                    {d.productName}
                  </Link>
                  <div className="text-xs text-(--color-muted)">{d.marketplaceCode}</div>
                </td>
                <td className="tabular-figures px-3 py-2 whitespace-nowrap">
                  {formatMoney(oldPrice)} {direction} {formatMoney(newPrice)}
                </td>
                {/* The reason enum, in Turkish. The core's `explanation` is English by
                    construction — it is built for the log — so it stays as the tooltip rather
                    than as the cell the operator is asked to read. */}
                <td className="px-3 py-2" title={d.explanation}>
                  {labelOf(DECISION_REASON_LABELS, d.reason)}
                </td>
                <td className="px-3 py-2">
                  <Chip tone={DECISION_STATE_TONE[d.state] ?? 'neutral'}>
                    {labelOf(SUBMISSION_STATE_LABELS, d.state)}
                  </Chip>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Ago at={d.decidedAt} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}

// --- Brand audit ----------------------------------------------------------------------------

/**
 * Marka denetimi (2026-09-03). Panel bugüne kadar tamamen satıcı tarafıydı — kill switch, bütçe,
 * faz dağılımı — ve markaları için kullanan biri, markası hakkında hiçbir şey söylemeyen bir
 * ekranla karşılaşıyordu. İzlenen marka yoksa bölüm hiç çizilmez: saf repricing kurulumunda panel
 * eskisiyle birebir aynıdır.
 *
 * The three summary numbers stay open; the per-brand table and the 30-day trend went behind a
 * `<details>`. They are what you read *after* a number surprises you, not what you scan — and on
 * an install watching a dozen brands they were half the page's height on every visit.
 */
function BrandAuditSection({ audit }: { audit: BrandAudit }) {
  const noSeller = audit.brands.reduce((n, b) => n + b.noSellerCount, 0);
  const neverLooked = audit.brands.reduce((n, b) => n + b.neverLookedCount, 0);
  const openFindings = audit.openFindings.stated + audit.openFindings.measured;

  return (
    <Section id="brand-audit" title="Marka Denetimi">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={`rounded border p-4 ${openFindings > 0 ? TONE_BOX.warn : TONE_BOX.neutral}`}>
          <div className="text-xs text-(--color-muted)">Açık bulgu</div>
          <div className="tabular-figures text-2xl font-bold">{formatNumber(openFindings)}</div>
          {/* İkisi ayrı, çünkü ayrı şeyler: biri birinin yazdığı bir kayda dayanır, diğeri bir
              örneklem yorumudur. Tek sayıya indirmek, kimsenin ayarlamadığı bir eşiği elle
              girilmiş bir kara liste eşleşmesinin yanına koyardı. */}
          <div className="mt-1 text-xs text-(--color-muted)">
            {formatNumber(audit.openFindings.stated)} kesin bilgi ·{' '}
            {formatNumber(audit.openFindings.measured)} yorum
          </div>
          <Link
            href="/watched-brands/findings"
            className="mt-2 inline-block text-xs text-(--color-accent) hover:underline"
          >
            Denetim bulgularını aç →
          </Link>
        </div>

        <div className="rounded border border-(--color-border) bg-(--color-surface) p-4">
          <div className="text-xs text-(--color-muted)">Satıcısı olmayan ürün</div>
          <div className="tabular-figures text-2xl font-bold">{formatNumber(noSeller)}</div>
          {/* "Henüz bakılmadı" ayrı yazılıyor: ilk turunu tamamlamamış bir kurulumda satıcısız
              sayısı tek başına yanıltıcıdır. */}
          <div className="mt-1 text-xs text-(--color-muted)">
            {neverLooked > 0
              ? `${formatNumber(neverLooked)} ürüne henüz bakılmadı — bu sayı eksik olabilir.`
              : 'Her ürüne en az bir kez bakıldı.'}
          </div>
        </div>

        <div className="rounded border border-(--color-border) bg-(--color-surface) p-4">
          <div className="text-xs text-(--color-muted)">Tavsiye fiyat kapsamı</div>
          <div className="tabular-figures text-2xl font-bold">
            {formatNumber(audit.referencePrice.productsWithPrice)}
            <span className="text-base font-normal text-(--color-muted)">
              {' / '}
              {formatNumber(audit.referencePrice.productsTotal)}
            </span>
          </div>
          {/* Kapsam, bulgunun kendisi kadar önemli: fiyat listesi olmayan ürün "altında değil"
              değil, "bilinmiyor"dur. */}
          <div className="mt-1 text-xs text-(--color-muted)">
            {audit.referencePrice.productsWithPrice === 0
              ? 'Fiyat listesi yüklenmemiş — bu sinyal hiç üretilmiyor.'
              : 'Listesi olmayan ürünler bu sinyalin dışındadır.'}
          </div>
        </div>
      </div>

      <details className="mt-4 rounded border border-(--color-border) bg-(--color-surface)">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Marka bazında ayrıntı ve son 30 günün seyri
        </summary>
        <div className="border-t border-(--color-border) p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-(--color-muted)">
                <tr>
                  <th scope="col" className="px-2 py-1">
                    Marka
                  </th>
                  <th scope="col" className="px-2 py-1">
                    Ürün
                  </th>
                  <th scope="col" className="px-2 py-1">
                    Satıcısız
                  </th>
                  <th scope="col" className="px-2 py-1">
                    Açık bulgu
                  </th>
                  <th scope="col" className="px-2 py-1">
                    Son tarama
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {audit.brands.map((brand) => (
                  <tr key={brand.id}>
                    <td className="px-2 py-1">
                      <Link
                        href={`/watched-brands/findings?watchedBrandId=${encodeURIComponent(brand.id)}`}
                        className="text-(--color-accent) hover:underline"
                      >
                        {brand.label}
                      </Link>
                      <span className="ml-2 text-xs text-(--color-muted)">{brand.marketplaceCode}</span>
                    </td>
                    <td className="tabular-figures px-2 py-1">{formatNumber(brand.productCount)}</td>
                    {/* Not colour alone: the count carries the word too, so the warning survives
                        greyscale and reaches a screen reader (WCAG 1.4.1). */}
                    <td className="tabular-figures px-2 py-1">
                      {brand.noSellerCount > 0 ? (
                        <span className={TONE_TEXT.warn}>{formatNumber(brand.noSellerCount)} ürün</span>
                      ) : (
                        <span className="text-(--color-muted)">yok</span>
                      )}
                    </td>
                    <td className="tabular-figures px-2 py-1">{formatNumber(brand.openFindings)}</td>
                    <td className="px-2 py-1">
                      <Ago at={brand.lastSweptAt} never="henüz taranmadı" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Otuz günlük seyir. Boş gün, hiçbir şeyin *saklanmadığı* gündür (teklif seti
              değişmediyse yeni bakış yazılmaz) — satıcı olmayan gün değil. Bu yüzden çizgi
              boşluktan geçirilmiyor, nokta atlanıyor. */}
          {audit.trend.length > 1 && (
            <div className="mt-4">
              <div className="mb-2 text-xs text-(--color-muted)">
                Son 30 gün — ortalama piyasa fiyatı ve satıcı sayısı
              </div>
              <PriceChart
                timestamps={audit.trend.map((t) => t.dayMs)}
                series={[
                  {
                    key: 'avgPrice',
                    label: 'Ort. fiyat',
                    color: 'var(--color-accent)',
                    values: audit.trend.map((t) => (t.avgPrice ? BigInt(t.avgPrice) : null)),
                  },
                ]}
                annotations={[
                  { label: 'Satıcı sayısı', values: audit.trend.map((t) => formatNumber(t.sellerCount)) },
                  {
                    label: 'Satıcısı olan ürün',
                    values: audit.trend.map((t) => formatNumber(t.productsWithOffers)),
                  },
                  {
                    label: 'Satıcısı olmayan ürün',
                    values: audit.trend.map((t) => formatNumber(t.productsWithoutOffers)),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </details>
    </Section>
  );
}

// --- Event log ------------------------------------------------------------------------------

/**
 * The raw log tail, closed by default.
 *
 * It used to head a section called *Aktif Uyarılar*, which it is not: the aggregate fills it from
 * `app_events` at `warn` and above — the last 20 lines, genuine alarms and routine grumbles alike
 * — while the actual open-alert count is a different number from a different table, shown a few
 * hundred pixels away. Two different things under near-identical names on one screen. Named for
 * what it is, and demoted below the things that need a decision.
 */
function EventLogSection({ events }: { events: AppEvent[] }) {
  return (
    <Section id="event-log" title="Sistem Günlüğü">
      <details className="rounded border border-(--color-border) bg-(--color-surface)">
        <summary className="cursor-pointer px-4 py-3 text-sm">
          Son {formatNumber(events.length)} uyarı ve hata kaydı
          <span className="ml-2 text-xs text-(--color-muted)">
            (teknik kayıt — müdahale gerektiren bir şey varsa yukarıda görünür)
          </span>
        </summary>
        <div className="border-t border-(--color-border)">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-(--color-muted)">Kayıt yok.</p>
          ) : (
            <ul className="max-h-[40vh] divide-y divide-(--color-border) overflow-y-auto">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2 text-sm">
                  <div className="min-w-0">
                    <Chip tone={e.level === 'error' ? 'danger' : 'warn'}>
                      {e.level === 'error' ? 'Hata' : 'Uyarı'}
                    </Chip>{' '}
                    {e.message}
                  </div>
                  <div className="flex flex-none items-center gap-3 text-xs text-(--color-muted)">
                    <Ago at={e.at} />
                    {e.listingId && (
                      <Link
                        className="text-(--color-accent) hover:underline"
                        href={`/listings/${e.listingId}`}
                      >
                        İlana git
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-(--color-border) px-4 py-2">
          <Link href="/events" className="text-sm text-(--color-accent) hover:underline">
            Tüm olay günlüğünü aç →
          </Link>
        </div>
      </details>
    </Section>
  );
}

// --- Screen ---------------------------------------------------------------------------------

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | undefined>();
  /** Best-effort: `/api/health` failing must not blank a working dashboard. */
  const [health, setHealth] = useState<HealthData | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loadedAt, setLoadedAt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    const dashboard = fetch('/api/dashboard')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((d: DashboardData) => {
        setData(d);
        setError(undefined);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // Its own chain, and its failure is swallowed: health is an *addition* to the verdict, so
    // losing it should cost the worker chip, not the whole screen.
    const healthCheck = fetch('/api/health')
      .then((res) => (res.ok ? res.json() : undefined))
      .then((h: HealthData | undefined) => setHealth(h))
      .catch(() => setHealth(undefined));
    void Promise.all([dashboard, healthCheck]).then(() => {
      setLoadedAt(Date.now());
      setRefreshing(false);
    });
  }, []);

  useEffect(() => {
    load();
    // doc 06 §2: the dashboard reflects current state, not a stale snapshot.
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // The first load failed and there is nothing to show. Says so plainly, including the part that
  // matters most: silence here is not evidence the system is fine.
  if (error && !data) {
    return (
      <div className={`rounded border p-4 ${TONE_BOX.danger}`}>
        <h1 className={`text-lg font-semibold ${TONE_TEXT.danger}`}>Panel verisi yüklenemedi</h1>
        <p className="mt-1 text-sm">
          Sunucuya ulaşılamadı ({error}). Sistemin durumu hakkında bu ekranda hiçbir şey söylenemez —
          çalışıyor da olabilir, durmuş da.
        </p>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="mt-3 rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm font-semibold hover:bg-(--color-hover) disabled:opacity-50"
        >
          {refreshing ? 'Deneniyor…' : 'Tekrar dene'}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Panel</h1>
        <p aria-live="polite" className="text-(--color-muted)">
          Sistem durumu okunuyor…
        </p>
        <div className="h-24 animate-pulse rounded border border-(--color-border) bg-(--color-surface)" />
        <div className="h-16 animate-pulse rounded border border-(--color-border) bg-(--color-surface)" />
      </div>
    );
  }

  const attention = buildAttention(data, health);
  const verdict = buildVerdict(data, attention);
  const modules = data.modules ?? { seller: true, brand: true };
  const coverageByCode = new Map(data.competitorAlerts.coverage.map((c) => [c.marketplaceCode, c]));

  return (
    <div className="space-y-8">
      <VerdictBanner
        verdict={verdict}
        data={data}
        health={health}
        lastLoadedAt={loadedAt}
        onRefresh={load}
        refreshing={refreshing}
      />

      {/* A refresh that failed while a previous read is still on screen. The numbers below are
          real but no longer current, and saying so costs a line — letting them age silently on a
          screen that auto-refreshes is how an operator trusts a half-hour-old "her şey yolunda". */}
      {error && (
        <p className={`rounded border p-3 text-sm ${TONE_BOX.warn}`}>
          Son yenileme başarısız oldu ({error}). Aşağıdaki bilgiler {formatTime(loadedAt)} itibarıyladır.
        </p>
      )}

      <Section id="attention" title="Dikkat Gerekenler">
        <AttentionList items={attention} />
      </Section>

      <Section id="safety" title="Güvenlik Anahtarları">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <SystemPauseState paused={data.systemPaused} seller={modules.seller} />
          {modules.seller && (
            <PriceSubmissionSwitch engaged={data.globalKillSwitchEngaged} onChanged={load} />
          )}
        </div>
      </Section>

      {modules.seller && (
        <>
          <Section
            id="marketplaces"
            title="Pazaryerleri"
            action={
              <Link href="/settings/marketplaces" className="text-sm text-(--color-accent) hover:underline">
                Pazaryeri ayarları →
              </Link>
            }
          >
            {data.marketplaces.length === 0 ? (
              <p className="rounded border border-(--color-border) bg-(--color-surface) p-4 text-sm text-(--color-muted)">
                Henüz etkin pazaryeri yok. Ayarlar &gt; Pazaryerleri ekranından ekleyin.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {data.marketplaces.map((m) => (
                  <MarketplaceCard
                    key={m.code}
                    marketplace={m}
                    coverage={coverageByCode.get(m.code)}
                    onChanged={load}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            id="phases"
            title="İlanlar Ne Durumda"
            action={
              <Link href="/listings" className="text-sm text-(--color-accent) hover:underline">
                Tüm ilanlar →
              </Link>
            }
          >
            <PhaseTiles distribution={data.phaseDistribution} />
          </Section>

          <Section
            id="decisions"
            title="Son Fiyat Değişiklikleri"
            action={
              <span className="text-xs text-(--color-muted)">
                Son {formatNumber(data.recentDecisions.length)} karar
              </span>
            }
          >
            <DecisionsTable decisions={data.recentDecisions} />
          </Section>
        </>
      )}

      {modules.brand && data.brandAudit && <BrandAuditSection audit={data.brandAudit} />}

      <EventLogSection events={data.alerts} />
    </div>
  );
}
