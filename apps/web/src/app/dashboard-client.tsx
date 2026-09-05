'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PriceChart } from '@/components/price-chart';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '@/lib/format';

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

interface Alert {
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
  alerts: Alert[];
  recentDecisions: Decision[];
}

const PHASES = ['SEEKING', 'CLIMBING', 'REFINING', 'OPTIMUM', 'BLOCKED'] as const;
const PHASE_LABELS: Record<string, string> = {
  SEEKING: 'Arıyor',
  CLIMBING: 'Tırmanıyor',
  REFINING: 'İnceltiyor',
  OPTIMUM: 'Optimum',
  BLOCKED: 'Bloke',
};

function budgetBarColor(consumed: number, allowance: number, reservePct: number): string {
  if (allowance <= 0) return 'bg-(--color-chip-bg)';
  const remaining = allowance - consumed;
  const reserve = allowance * (reservePct / 100);
  if (remaining <= 0) return 'bg-(--color-danger)';
  if (remaining <= reserve) return 'bg-(--color-warning)';
  return 'bg-(--color-success)';
}

/**
 * The **system pause** (doc 06 §2) — the actual "stop everything" control. While engaged, no
 * job runs at all: no imports, no buybox observation, no decision-making, no submissions.
 * Genuinely separate from `PriceSubmissionSwitch` below — see both routes' doc comments for why
 * they must never share a setting, and `packages/jobs/src/scheduler.ts`'s `isSystemPaused`.
 *
 * Fail-closed at the API level: a fresh install reports `engaged: true` with no setting ever
 * written, so this renders "Duraklatıldı" by default — nothing runs until an operator explicitly
 * resumes it.
 */
function SystemPauseSwitch({ engaged, onChanged }: { engaged: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function setEngaged(next: boolean) {
    setBusy(true);
    try {
      await fetch('/api/system-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engaged: next }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  function toggle() {
    if (engaged) {
      // Resuming starts every job — imports, observation, decisions and (subject to its own,
      // separate switch below) submissions.
      if (
        !window.confirm(
          'Sistemi devam ettirmek üzeresiniz. İçe aktarma, buybox gözlemi ve karar hesaplama işleri yeniden başlayacak. (Fiyat gönderimi bundan ayrı bir anahtarla kontrol edilir.) Emin misiniz?',
        )
      ) {
        return;
      }
    }
    void setEngaged(!engaged);
  }
  return (
    <div
      className={`flex items-center justify-between rounded border p-4 ${
        engaged
          ? 'border-(--color-border) bg-(--color-surface)'
          : 'border-(--color-success) bg-(--color-success-bg)'
      }`}
    >
      <div>
        <div className="font-semibold">Genel Durdurma: {engaged ? 'Duraklatıldı' : 'Çalışıyor'}</div>
        <p className="text-sm text-(--color-muted)">
          {engaged
            ? 'Hiçbir iş çalışmıyor — içe aktarma, buybox gözlemi, karar hesaplama ve fiyat gönderimi dahil. Sistemin varsayılan güvenli durumudur.'
            : 'İşler normal şekilde çalışıyor. Fiyat gönderimi ayrı bir anahtarla kontrol edilir — aşağıya bakın.'}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`rounded px-3 py-2 text-sm font-semibold ${
          engaged
            ? 'bg-(--color-success) text-(--color-success-ink)'
            : 'border border-(--color-border) bg-(--color-surface)'
        }`}
      >
        {engaged ? 'Devam Ettir' : 'Duraklat'}
      </button>
    </div>
  );
}

/**
 * The **price-submission** switch (doc 06 §2, R-UI-9) — narrower than `SystemPauseSwitch`
 * above, and deliberately so: while engaged, every *other* job keeps running (imports, buybox
 * observation, decisions) but `SubmitPriceChanges` never calls a marketplace adapter.
 *
 * Fail-closed at the API level (`@buybox/shared`): a fresh install reports `engaged: true` with
 * no setting ever written, so this control renders "Durduruldu" by default, not "Aktif" — there
 * is nothing to disengage accidentally. Disengaging (letting price submissions run) is the one
 * direction that asks for confirmation; re-engaging is always one click.
 */
function PriceSubmissionSwitch({ engaged, onChanged }: { engaged: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function setEngaged(next: boolean) {
    setBusy(true);
    try {
      await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engaged: next }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  function toggle() {
    if (engaged) {
      // Disengaging is what lets SubmitPriceChanges start sending real prices to marketplaces.
      if (
        !window.confirm(
          'Fiyat gönderimini açmak üzeresiniz. Bundan sonra uygun ilanlar için gerçek fiyat güncellemeleri pazaryerlerine gönderilebilir. Emin misiniz?',
        )
      ) {
        return;
      }
    }
    void setEngaged(!engaged);
  }
  return (
    <div
      className={`flex items-center justify-between rounded border p-4 ${
        engaged
          ? 'border-(--color-border) bg-(--color-surface)'
          : 'border-(--color-danger) bg-(--color-danger-bg)'
      }`}
    >
      <div>
        <div className="font-semibold">
          Fiyat Gönderimi: {engaged ? 'Durduruldu' : 'AKTİF — fiyat gönderiliyor'}
        </div>
        <p className="text-sm text-(--color-muted)">
          {engaged
            ? 'Hiçbir pazaryerine fiyat güncellemesi gönderilmiyor. Bu, sistemin varsayılan güvenli durumudur.'
            : 'Sistem, uygun listing ve pazaryeri ayarlarına sahip ürünler için gerçek fiyat güncellemeleri gönderebilir.'}
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`rounded px-3 py-2 text-sm font-semibold ${
          engaged
            ? 'bg-(--color-danger) text-(--color-danger-ink)'
            : 'border border-(--color-border) bg-(--color-surface)'
        }`}
      >
        {engaged ? 'Fiyat Gönderimini Aç' : 'Fiyat Gönderimini Durdur'}
      </button>
    </div>
  );
}

function MarketplaceKillSwitch({
  marketplace,
  onChanged,
}: {
  marketplace: MarketplaceInfo;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await fetch('/api/kill-switch/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceCode: marketplace.code, engaged: !marketplace.killSwitchEngaged }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className={`rounded px-2 py-1 text-xs font-semibold ${
        marketplace.killSwitchEngaged
          ? 'bg-(--color-danger) text-(--color-danger-ink)'
          : 'border border-(--color-border) bg-(--color-surface)'
      }`}
    >
      {marketplace.killSwitchEngaged ? 'Durduruldu' : 'Aktif'}
    </button>
  );
}

/** Stable identity for "nothing loaded yet", so paging does not re-slice on every render. */
const NO_ROWS: never[] = [];

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | undefined>();
  const [error, setError] = useState<string | undefined>();
  // Before the early returns below: hook order has to be the same on every render.
  const pagedAlerts = usePagedRows(data?.alerts ?? NO_ROWS, { pageSize: 25 });
  const pagedDecisions = usePagedRows(data?.recentDecisions ?? NO_ROWS, { pageSize: 25 });

  function load() {
    fetch('/api/dashboard')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((d: DashboardData) => setData(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000); // doc 06 §2: dashboard reflects current state, not a stale snapshot
    return () => clearInterval(interval);
  }, []);

  if (error) return <p className="text-(--color-danger)">Panel verisi yüklenemedi: {error}</p>;
  if (!data) return <p className="text-(--color-muted)">Yükleniyor…</p>;

  const totalPhased = PHASES.reduce((sum, p) => sum + (data.phaseDistribution[p] ?? 0), 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Panel</h1>

      <div className="space-y-3">
        <SystemPauseSwitch engaged={data.systemPaused} onChanged={load} />
        <PriceSubmissionSwitch engaged={data.globalKillSwitchEngaged} onChanged={load} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          Pazaryeri Sağlığı ve Bütçe
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.marketplaces.map((m) => (
            <div key={m.code} className="rounded border border-(--color-border) bg-(--color-surface) p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">{m.displayName}</span>
                <MarketplaceKillSwitch marketplace={m} onChanged={load} />
              </div>
              <dl className="space-y-1 text-sm text-(--color-muted)">
                <div className="flex justify-between">
                  <dt>Otomasyon</dt>
                  <dd>{m.automationEnabled ? 'açık' : 'kapalı'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Son içe aktarım</dt>
                  <dd>{formatDateTime(m.health.lastImportAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Son buybox gözlemi</dt>
                  <dd>{formatDateTime(m.health.lastBuyboxObservationAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Erişilebilirlik / kazınma hata oranı</dt>
                  <dd>bilinmiyor</dd>
                </div>
              </dl>
              {m.budget ? (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-(--color-muted)">
                    <span>Güncelleme bütçesi</span>
                    <span>
                      {formatNumber(m.budget.consumed)} / {formatNumber(m.budget.allowance)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-(--color-border)">
                    <div
                      className={`h-full ${budgetBarColor(m.budget.consumed, m.budget.allowance, m.budget.reservePct)}`}
                      style={{
                        width: `${Math.min(100, (m.budget.consumed / Math.max(1, m.budget.allowance)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-(--color-muted)">Bugün için bütçe henüz sıfırlanmadı.</p>
              )}
            </div>
          ))}
          {data.marketplaces.length === 0 && (
            <p className="text-(--color-muted)">Henüz etkin pazaryeri yok — Ayarlar'dan ekleyin.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          Rakip Alarmları
        </h2>
        {/* The count is never shown on its own. A zero beside a scraper that has not succeeded
            in a day means "we have not looked", and that reads as "nothing is wrong" unless
            the tile says so itself. */}
        <div
          className={`rounded border p-4 ${
            data.competitorAlerts.staleMarketplaces.length > 0
              ? 'border-(--color-danger-border) bg-(--color-danger-bg)'
              : data.competitorAlerts.open > 0
                ? 'border-(--color-warning-border) bg-(--color-warning-bg)'
                : 'border-(--color-border)'
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <span className="text-2xl font-bold">{formatNumber(data.competitorAlerts.open)}</span>
              <span className="ml-2 text-sm text-(--color-muted)">açık alarm</span>
            </div>
            <Link className="text-sm text-(--color-accent) hover:underline" href="/alerts">
              Alarmları görüntüle →
            </Link>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            {data.competitorAlerts.coverage.map((c) => (
              <div
                key={c.marketplaceCode}
                className={c.stale ? 'font-medium text-(--color-danger)' : 'text-(--color-muted)'}
              >
                {c.displayName}:{' '}
                {c.lastOkAt === null
                  ? 'son 7 günde başarılı tarama yok'
                  : `son başarılı tarama ${formatDateTime(c.lastOkAt)}`}
              </div>
            ))}
          </div>
          {data.competitorAlerts.staleMarketplaces.length > 0 && (
            <p className="mt-2 text-xs font-medium text-(--color-danger)">
              Tarama verisi bayat — alarm görünmemesi &ldquo;sorun yok&rdquo; anlamına gelmez.
            </p>
          )}
        </div>
      </section>

      {/*
        Marka denetimi (2026-09-03). Panel bugüne kadar tamamen satıcı tarafıydı — kill switch,
        bütçe, faz dağılımı — ve markaları için kullanan biri, markası hakkında hiçbir şey
        söylemeyen bir ekranla karşılaşıyordu. İzlenen marka yoksa bölüm hiç çizilmez: saf
        repricing kurulumunda panel eskisiyle birebir aynıdır.
      */}
      {data.brandAudit && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
            Marka Denetimi
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded border border-(--color-border) bg-(--color-surface) p-4">
              <div className="text-xs text-(--color-muted)">Açık bulgu</div>
              <div className="text-2xl font-bold">
                {formatNumber(data.brandAudit.openFindings.stated + data.brandAudit.openFindings.measured)}
              </div>
              {/* İkisi ayrı, çünkü ayrı şeyler: biri birinin yazdığı bir kayda dayanır, diğeri
                  bir örneklem yorumudur. Tek sayıya indirmek, kimsenin ayarlamadığı bir eşiği
                  elle girilmiş bir kara liste eşleşmesinin yanına koyardı. */}
              <div className="mt-1 text-xs text-(--color-muted)">
                {formatNumber(data.brandAudit.openFindings.stated)} kesin bilgi ·{' '}
                {formatNumber(data.brandAudit.openFindings.measured)} yorum
              </div>
              <Link
                href="/watched-brands/findings"
                className="mt-2 inline-block text-xs text-(--color-accent) hover:underline"
              >
                Denetim Bulguları →
              </Link>
            </div>

            <div className="rounded border border-(--color-border) bg-(--color-surface) p-4">
              <div className="text-xs text-(--color-muted)">Satıcısı olmayan ürün</div>
              <div className="text-2xl font-bold">
                {formatNumber(data.brandAudit.brands.reduce((n, b) => n + b.noSellerCount, 0))}
              </div>
              {/* "Henüz bakılmadı" ayrı yazılıyor: ilk turunu tamamlamamış bir kurulumda
                  satıcısız sayısı tek başına yanıltıcıdır. */}
              <div className="mt-1 text-xs text-(--color-muted)">
                {formatNumber(data.brandAudit.brands.reduce((n, b) => n + b.neverLookedCount, 0))} ürüne henüz
                bakılmadı
              </div>
            </div>

            <div className="rounded border border-(--color-border) bg-(--color-surface) p-4">
              <div className="text-xs text-(--color-muted)">Tavsiye fiyat kapsamı</div>
              <div className="text-2xl font-bold">
                {formatNumber(data.brandAudit.referencePrice.productsWithPrice)}
                <span className="text-base font-normal text-(--color-muted)">
                  {' / '}
                  {formatNumber(data.brandAudit.referencePrice.productsTotal)}
                </span>
              </div>
              {/* Kapsam, bulgunun kendisi kadar önemli: fiyat listesi olmayan ürün "altında
                  değil" değil, "bilinmiyor"dur. */}
              <div className="mt-1 text-xs text-(--color-muted)">
                {data.brandAudit.referencePrice.productsWithPrice === 0
                  ? 'Fiyat listesi yüklenmemiş — bu sinyal hiç üretilmiyor.'
                  : 'Listesi olmayan ürünler bu sinyalin dışındadır.'}
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-(--color-muted)">
                <tr>
                  <th className="px-2 py-1">Marka</th>
                  <th className="px-2 py-1">Ürün</th>
                  <th className="px-2 py-1">Satıcısız</th>
                  <th className="px-2 py-1">Açık bulgu</th>
                  <th className="px-2 py-1">Son tarama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {data.brandAudit.brands.map((brand) => (
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
                    <td className="px-2 py-1 tabular-nums">{formatNumber(brand.productCount)}</td>
                    <td className="px-2 py-1 tabular-nums">
                      {brand.noSellerCount > 0 ? (
                        <span className="text-(--color-warning)">{formatNumber(brand.noSellerCount)}</span>
                      ) : (
                        <span className="text-(--color-muted)">0</span>
                      )}
                    </td>
                    <td className="px-2 py-1 tabular-nums">{formatNumber(brand.openFindings)}</td>
                    <td className="px-2 py-1">
                      {brand.lastSweptAt ? formatDateTime(brand.lastSweptAt) : 'henüz taranmadı'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Otuz günlük seyir. Boş gün, hiçbir şeyin *saklanmadığı* gündür (teklif seti
              değişmediyse yeni bakış yazılmaz) — satıcı olmayan gün değil. Bu yüzden çizgi
              boşluktan geçirilmiyor, nokta atlanıyor. */}
          {data.brandAudit.trend.length > 1 && (
            <div className="mt-4 rounded border border-(--color-border) p-4">
              <div className="mb-2 text-xs text-(--color-muted)">
                Son 30 gün — ortalama piyasa fiyatı ve satıcı sayısı
              </div>
              <PriceChart
                timestamps={data.brandAudit.trend.map((t) => t.dayMs)}
                series={[
                  {
                    key: 'avgPrice',
                    label: 'Ort. fiyat',
                    color: 'var(--color-accent)',
                    values: data.brandAudit.trend.map((t) => (t.avgPrice ? BigInt(t.avgPrice) : null)),
                  },
                ]}
                annotations={[
                  {
                    label: 'Satıcı sayısı',
                    values: data.brandAudit.trend.map((t) => formatNumber(t.sellerCount)),
                  },
                  {
                    label: 'Satıcısı olan ürün',
                    values: data.brandAudit.trend.map((t) => formatNumber(t.productsWithOffers)),
                  },
                  {
                    label: 'Satıcısı olmayan ürün',
                    values: data.brandAudit.trend.map((t) => formatNumber(t.productsWithoutOffers)),
                  },
                ]}
              />
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          Faz Dağılımı
        </h2>
        <div className="flex gap-4">
          {PHASES.map((phase) => (
            <div key={phase} className="flex-1 rounded border border-(--color-border) p-3 text-center">
              <div className="text-2xl font-bold">{formatNumber(data.phaseDistribution[phase] ?? 0)}</div>
              <div className="text-xs text-(--color-muted)">{PHASE_LABELS[phase]}</div>
            </div>
          ))}
        </div>
        {totalPhased > 0 && (
          <p className="mt-2 text-xs text-(--color-muted)">
            {formatPercent(((data.phaseDistribution.OPTIMUM ?? 0) / totalPhased) * 100)} optimum durumda.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          Aktif Uyarılar
        </h2>
        {data.alerts.length === 0 ? (
          <p className="text-sm text-(--color-muted)">Uyarı yok.</p>
        ) : (
          <div className="space-y-2">
            <ul className="table-frame max-h-[50vh] divide-y divide-(--color-border) rounded border border-(--color-border)">
              {pagedAlerts.rows.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span
                      className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${
                        a.level === 'error'
                          ? 'bg-(--color-danger-bg) text-(--color-danger)'
                          : 'bg-(--color-warning-bg) text-(--color-warning)'
                      }`}
                    >
                      {a.level === 'error' ? 'HATA' : 'UYARI'}
                    </span>
                    {a.message}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-(--color-muted)">
                    <span>{formatDateTime(a.at)}</span>
                    {a.listingId && (
                      <Link
                        className="text-(--color-accent) hover:underline"
                        href={`/listings/${a.listingId}`}
                      >
                        İlana git
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination state={pagedAlerts} label="uyarı" />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          Son Kararlar
        </h2>
        {data.recentDecisions.length === 0 ? (
          <p className="text-sm text-(--color-muted)">Henüz karar yok.</p>
        ) : (
          <div className="space-y-2">
            <TableFrame maxHeight="60vh">
              <table className="w-full text-sm">
                <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
                  <tr>
                    <th className="px-3 py-2">Ürün</th>
                    <th className="px-3 py-2">Eski → Yeni</th>
                    <th className="px-3 py-2">Neden</th>
                    <th className="px-3 py-2">Durum</th>
                    <th className="px-3 py-2">Zaman</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {pagedDecisions.rows.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2">
                        <Link
                          className="text-(--color-accent) hover:underline"
                          href={`/listings/${d.listingId}`}
                        >
                          {d.productName}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatMoney(BigInt(d.oldPrice))} → {formatMoney(BigInt(d.newPrice))}
                      </td>
                      <td className="px-3 py-2">{d.explanation}</td>
                      <td className="px-3 py-2">{d.state}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(d.decidedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
            <Pagination state={pagedDecisions} label="karar" />
          </div>
        )}
      </section>
    </div>
  );
}
