'use client';

import { useEffect, useState } from 'react';
import { formatDateTime, formatNumber } from '@/lib/format';

interface JobRow {
  jobName: string;
  label: string;
  cadenceMs: number | null;
  perMarketplace: boolean;
  defaultPayload: Record<string, unknown>;
  enabled: boolean;
  nextRunAt: number | null;
  lastRun: {
    id: string;
    startedAt: number;
    finishedAt: number | null;
    state: string;
    itemsTotal: number;
    itemsOk: number;
    itemsFailed: number;
    error: string | null;
  } | null;
}

interface ClaimedJob {
  id: string;
  jobName: string;
  lockedBy: string | null;
  lockedUntil: number | null;
  attempts: number;
}

interface CircuitBreakerRow {
  marketplaceCode: string;
  state: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  openedAt: number | null;
  lastError: string | null;
  updatedAt: number;
}

interface JobsOverview {
  jobs: JobRow[];
  queueDepth: Record<string, number>;
  claimed: ClaimedJob[];
  circuitBreakers: CircuitBreakerRow[];
}

interface JobRunRow {
  id: string;
  jobName: string;
  startedAt: number;
  finishedAt: number | null;
  state: string;
  itemsTotal: number;
  itemsOk: number;
  itemsFailed: number;
  error: string | null;
  correlationId: string;
}

interface MarketplaceOption {
  code: string;
  displayName: string;
}

function formatCadence(ms: number | null): string {
  if (ms === null) return 'Yalnızca manuel';
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} saatte bir`;
  if (ms % 60_000 === 0) return `${ms / 60_000} dakikada bir`;
  return `${ms / 1000} saniyede bir`;
}

const CIRCUIT_LABELS: Record<string, string> = {
  closed: 'Kapalı (normal)',
  open: 'Açık (devre dışı)',
  'half-open': 'Yarı açık (deneme)',
};

export function JobsClient() {
  const [overview, setOverview] = useState<JobsOverview | null>(null);
  const [marketplaces, setMarketplaces] = useState<MarketplaceOption[]>([]);
  const [runHistory, setRunHistory] = useState<JobRunRow[]>([]);
  const [historyFilter, setHistoryFilter] = useState<{ jobName: string; state: string }>({
    jobName: '',
    state: '',
  });
  const [selectedMarketplace, setSelectedMarketplace] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = () => {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((data: JobsOverview) => setOverview(data))
      .catch((e) => setError(String(e)));
  };

  const loadHistory = () => {
    const params = new URLSearchParams();
    if (historyFilter.jobName) params.set('jobName', historyFilter.jobName);
    if (historyFilter.state) params.set('state', historyFilter.state);
    fetch(`/api/jobs/run-history?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { runs: JobRunRow[] }) => setRunHistory(data.runs))
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    loadOverview();
    fetch('/api/settings/marketplaces')
      .then((r) => r.json())
      .then((data: { marketplaces: MarketplaceOption[] }) => setMarketplaces(data.marketplaces))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [historyFilter]);

  async function runNow(job: JobRow) {
    setBusy(job.jobName);
    setError(null);
    try {
      // Must mirror the <select>'s own fallback exactly (`marketplaces[0]?.code`) — the
      // dropdown shows a marketplace pre-selected before the operator ever touches it, and
      // `selectedMarketplace` state only gets an entry on `onChange`. Reading the state alone
      // here would send `marketplaceCode: undefined` for a job whose row visibly has a
      // marketplace selected, and the API correctly rejects that (`run-now/route.ts`) — but the
      // rejection would look like a bug in the operator's own selection, not in this fallback.
      const marketplaceCode = job.perMarketplace
        ? (selectedMarketplace[job.jobName] ?? marketplaces[0]?.code)
        : undefined;
      const res = await fetch('/api/jobs/run-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName: job.jobName, marketplaceCode }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Bilinmeyen hata');
      loadOverview();
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleEnabled(job: JobRow) {
    setBusy(job.jobName);
    try {
      await fetch('/api/jobs/enabled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName: job.jobName, enabled: !job.enabled }),
      });
      loadOverview();
    } finally {
      setBusy(null);
    }
  }

  async function resetCircuit(marketplaceCode: string) {
    setBusy(`circuit-${marketplaceCode}`);
    try {
      await fetch('/api/jobs/circuit-breaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceCode }),
      });
      loadOverview();
    } finally {
      setBusy(null);
    }
  }

  if (!overview) return <p className="text-[var(--color-muted)]">Yükleniyor…</p>;

  return (
    <div className="space-y-8">
      {error && <p className="text-[var(--color-danger)]">{error}</p>}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          İş Kataloğu
        </h2>
        <div className="overflow-x-auto rounded border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-xs uppercase text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">İş</th>
                <th className="px-3 py-2">Zamanlama</th>
                <th className="px-3 py-2">Son Çalışma</th>
                <th className="px-3 py-2">Sonraki Çalışma</th>
                <th className="px-3 py-2">Etkin</th>
                <th className="px-3 py-2">Şimdi Çalıştır</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {overview.jobs.map((job) => (
                <tr key={job.jobName}>
                  <td className="px-3 py-2 font-medium">{job.label}</td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">{formatCadence(job.cadenceMs)}</td>
                  <td className="px-3 py-2">
                    {job.lastRun ? (
                      <span>
                        {formatDateTime(job.lastRun.startedAt)} —{' '}
                        <span
                          className={
                            job.lastRun.state === 'failed'
                              ? 'text-[var(--color-danger)]'
                              : 'text-[var(--color-muted)]'
                          }
                        >
                          {job.lastRun.state}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted)]">Hiç çalışmadı</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">
                    {job.nextRunAt ? formatDateTime(job.nextRunAt) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={busy === job.jobName}
                      onClick={() => toggleEnabled(job)}
                      className={
                        job.enabled
                          ? 'rounded bg-[var(--color-success)] px-2 py-1 text-xs text-white'
                          : 'rounded bg-slate-300 px-2 py-1 text-xs text-slate-700'
                      }
                    >
                      {job.enabled ? 'Etkin' : 'Devre dışı'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {job.perMarketplace && (
                        <select
                          className="rounded border border-[var(--color-border)] px-1 py-0.5 text-xs"
                          value={selectedMarketplace[job.jobName] ?? marketplaces[0]?.code ?? ''}
                          onChange={(e) =>
                            setSelectedMarketplace((prev) => ({ ...prev, [job.jobName]: e.target.value }))
                          }
                        >
                          {marketplaces.map((m) => (
                            <option key={m.code} value={m.code}>
                              {m.displayName}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        disabled={busy === job.jobName || (job.perMarketplace && marketplaces.length === 0)}
                        onClick={() => runNow(job)}
                        className="rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface)]"
                      >
                        Çalıştır
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Kuyruk Derinliği ve Alınan İşler
        </h2>
        <div className="flex flex-wrap gap-4">
          {['ready', 'locked', 'done', 'failed'].map((state) => (
            <div key={state} className="rounded border border-[var(--color-border)] px-4 py-2 text-center">
              <div className="text-xl font-bold">{formatNumber(overview.queueDepth[state] ?? 0)}</div>
              <div className="text-xs text-[var(--color-muted)]">{state}</div>
            </div>
          ))}
        </div>
        {overview.claimed.length > 0 && (
          <ul className="mt-3 divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)] text-sm">
            {overview.claimed.map((j) => (
              <li key={j.id} className="flex justify-between px-3 py-2">
                <span>
                  {j.jobName} — {j.lockedBy}
                </span>
                <span className="text-[var(--color-muted)]">
                  {j.attempts}. deneme, kilit bitiş: {formatDateTime(j.lockedUntil)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Devre Kesici (Circuit Breaker)
        </h2>
        {overview.circuitBreakers.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Hiç tetiklenmedi.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] rounded border border-[var(--color-border)] text-sm">
            {overview.circuitBreakers.map((c) => (
              <li key={c.marketplaceCode} className="flex items-center justify-between px-3 py-2">
                <div>
                  <span className="font-medium">{c.marketplaceCode}</span> —{' '}
                  <span
                    className={
                      c.state === 'closed' ? 'text-[var(--color-muted)]' : 'text-[var(--color-danger)]'
                    }
                  >
                    {CIRCUIT_LABELS[c.state]}
                  </span>
                  {c.state !== 'closed' && (
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      {c.consecutiveFailures} ardışık hata — {c.lastError}
                    </span>
                  )}
                </div>
                {c.state !== 'closed' && (
                  <button
                    type="button"
                    disabled={busy === `circuit-${c.marketplaceCode}`}
                    onClick={() => resetCircuit(c.marketplaceCode)}
                    className="rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface)]"
                  >
                    Sıfırla
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* doc 07 §3: a tripped circuit must not silently disable repricing — it's shown, not hidden. */}
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Devre açıkken ilgili pazaryerine giden istekler duraklatılır; yeniden fiyatlandırma ve diğer işler
          bloke olmaz, yalnızca o pazaryerine giden çağrılar ertelenir.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Çalışma Geçmişi
        </h2>
        <div className="mb-2 flex gap-2">
          <select
            className="rounded border border-[var(--color-border)] px-2 py-1 text-sm"
            value={historyFilter.jobName}
            onChange={(e) => setHistoryFilter((f) => ({ ...f, jobName: e.target.value }))}
          >
            <option value="">Tüm işler</option>
            {overview.jobs.map((j) => (
              <option key={j.jobName} value={j.jobName}>
                {j.label}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-[var(--color-border)] px-2 py-1 text-sm"
            value={historyFilter.state}
            onChange={(e) => setHistoryFilter((f) => ({ ...f, state: e.target.value }))}
          >
            <option value="">Tüm durumlar</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
          </select>
        </div>
        <div className="overflow-x-auto rounded border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-xs uppercase text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">İş</th>
                <th className="px-3 py-2">Başlangıç</th>
                <th className="px-3 py-2">Süre</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Öğeler</th>
                <th className="px-3 py-2">Hata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {runHistory.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.jobName}</td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">{formatDateTime(r.startedAt)}</td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">
                    {r.finishedAt ? `${((r.finishedAt - r.startedAt) / 1000).toFixed(1)} sn` : '—'}
                  </td>
                  <td className={r.state === 'failed' ? 'px-3 py-2 text-[var(--color-danger)]' : 'px-3 py-2'}>
                    {r.state}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">
                    {r.itemsOk}/{r.itemsTotal} başarılı
                    {r.itemsFailed > 0 ? `, ${r.itemsFailed} başarısız` : ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-danger)]">{r.error ?? ''}</td>
                </tr>
              ))}
              {runHistory.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[var(--color-muted)]">
                    Kayıt yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
