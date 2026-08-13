'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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

interface DashboardData {
  globalKillSwitchEngaged: boolean;
  marketplaces: MarketplaceInfo[];
  phaseDistribution: Record<string, number>;
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
  if (allowance <= 0) return 'bg-slate-300';
  const remaining = allowance - consumed;
  const reserve = allowance * (reservePct / 100);
  if (remaining <= 0) return 'bg-[var(--color-danger)]';
  if (remaining <= reserve) return 'bg-[var(--color-warning)]';
  return 'bg-[var(--color-success)]';
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
          ? 'bg-[var(--color-danger)] text-white'
          : 'border border-[var(--color-border)] bg-white'
      }`}
    >
      {marketplace.killSwitchEngaged ? 'Durduruldu' : 'Aktif'}
    </button>
  );
}

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | undefined>();
  const [error, setError] = useState<string | undefined>();

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

  if (error) return <p className="text-[var(--color-danger)]">Panel verisi yüklenemedi: {error}</p>;
  if (!data) return <p className="text-[var(--color-muted)]">Yükleniyor…</p>;

  const totalPhased = PHASES.reduce((sum, p) => sum + (data.phaseDistribution[p] ?? 0), 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Panel</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Pazaryeri Sağlığı ve Bütçe
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.marketplaces.map((m) => (
            <div
              key={m.code}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">{m.displayName}</span>
                <MarketplaceKillSwitch marketplace={m} onChanged={load} />
              </div>
              <dl className="space-y-1 text-sm text-[var(--color-muted)]">
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
                  <div className="mb-1 flex justify-between text-xs text-[var(--color-muted)]">
                    <span>Güncelleme bütçesi</span>
                    <span>
                      {formatNumber(m.budget.consumed)} / {formatNumber(m.budget.allowance)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
                    <div
                      className={`h-full ${budgetBarColor(m.budget.consumed, m.budget.allowance, m.budget.reservePct)}`}
                      style={{
                        width: `${Math.min(100, (m.budget.consumed / Math.max(1, m.budget.allowance)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-[var(--color-muted)]">Bugün için bütçe henüz sıfırlanmadı.</p>
              )}
            </div>
          ))}
          {data.marketplaces.length === 0 && (
            <p className="text-[var(--color-muted)]">Henüz etkin pazaryeri yok — Ayarlar'dan ekleyin.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Faz Dağılımı
        </h2>
        <div className="flex gap-4">
          {PHASES.map((phase) => (
            <div key={phase} className="flex-1 rounded border border-[var(--color-border)] p-3 text-center">
              <div className="text-2xl font-bold">{formatNumber(data.phaseDistribution[phase] ?? 0)}</div>
              <div className="text-xs text-[var(--color-muted)]">{PHASE_LABELS[phase]}</div>
            </div>
          ))}
        </div>
        {totalPhased > 0 && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            {formatPercent(((data.phaseDistribution.OPTIMUM ?? 0) / totalPhased) * 100)} optimum durumda.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Aktif Uyarılar
        </h2>
        {data.alerts.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Uyarı yok.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)]">
            {data.alerts.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span
                    className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${
                      a.level === 'error'
                        ? 'bg-red-100 text-[var(--color-danger)]'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {a.level === 'error' ? 'HATA' : 'UYARI'}
                  </span>
                  {a.message}
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
                  <span>{formatDateTime(a.at)}</span>
                  {a.listingId && (
                    <Link
                      className="text-[var(--color-accent)] hover:underline"
                      href={`/listings/${a.listingId}`}
                    >
                      İlana git
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Son Kararlar
        </h2>
        {data.recentDecisions.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Henüz karar yok.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2">Ürün</th>
                  <th className="px-3 py-2">Eski → Yeni</th>
                  <th className="px-3 py-2">Neden</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Zaman</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.recentDecisions.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2">
                      <Link
                        className="text-[var(--color-accent)] hover:underline"
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
          </div>
        )}
      </section>
    </div>
  );
}
