'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import { formatDateTime, formatDuration, formatNumber, formatTime } from '@/lib/format';

/**
 * How often the Jobs screen re-reads the overview.
 *
 * The web app cannot see the worker's memory — a run is only observable through the rows the
 * worker writes (doc 10 §2), so "live" here means polling. Two speeds, because idle is the
 * common case: `ACTIVE` while anything is queued, running or expanded, `IDLE` otherwise. A
 * server-sent-events endpoint would still be this same poll, just moved into the route
 * handler, so it buys nothing until there is more than one operator watching.
 */
const OVERVIEW_POLL_ACTIVE_MS = 1500;
const OVERVIEW_POLL_IDLE_MS = 15_000;
/** The detail panel refreshes faster than the overview — it is what the operator is staring at. */
const DETAIL_POLL_MS = 1000;
/**
 * How long a click waits for the worker to acknowledge it before the UI stops claiming the job
 * is queued. `Scheduler.startLoop` ticks every 2s, so anything past this means the worker is
 * down — and saying so is far better than a button stuck on "Kuyruğa alındı" forever.
 */
const ENQUEUE_ACK_TIMEOUT_MS = 20_000;
/** No progress heartbeat for this long, while still `running`, reads as stuck rather than slow. */
const STALL_AFTER_MS = 45_000;

interface ActiveRun {
  id: string;
  startedAt: number;
  itemsTotal: number;
  itemsDone: number;
  currentItem: string | null;
  progressAt: number | null;
}

interface JobRow {
  jobName: string;
  label: string;
  cadenceMs: number | null;
  isCadenceOverride: boolean;
  defaultCadenceMs: number | null;
  perMarketplace: boolean;
  defaultPayload: Record<string, unknown>;
  enabled: boolean;
  nextRunAt: number | null;
  /** A `job_queue` row exists but no worker has claimed it yet. */
  queued: boolean;
  /** The `job_runs` row of a handler executing right now, with its progress heartbeat. */
  activeRun: ActiveRun | null;
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

interface RunDetail {
  run: {
    id: string;
    jobName: string;
    startedAt: number;
    finishedAt: number | null;
    state: string;
    itemsTotal: number;
    itemsDone: number;
    itemsOk: number;
    itemsFailed: number;
    currentItem: string | null;
    progressAt: number | null;
    error: string | null;
  };
  events: {
    id: string;
    at: number;
    level: string;
    code: string;
    message: string;
    listingId: string | null;
  }[];
}

interface ScrapeRateRow {
  marketplaceCode: string;
  requestsPerMinute: number;
  burst: number;
  isOverride: boolean;
  default: { requestsPerMinute: number; burst: number };
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

const EVENT_LEVEL_CLASS: Record<string, string> = {
  error: 'text-[var(--color-danger)]',
  warn: 'text-[var(--color-warning)]',
  info: 'text-[var(--color-muted)]',
  debug: 'text-[var(--color-muted)]',
};

/**
 * The live progress bar. Two shapes, because "0 of 0" and "0 of 200" mean different things:
 * with a known total it fills; before the handler has reported one (a scrape spends its first
 * seconds deciding which listings are even due) it animates without claiming a percentage.
 */
function ProgressBar({ done, total }: { done: number; total: number }) {
  if (total <= 0) {
    return (
      <div className="h-2 w-full overflow-hidden rounded bg-[var(--color-border)]">
        <div className="h-full w-1/3 animate-pulse rounded bg-[var(--color-accent)]" />
      </div>
    );
  }
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded bg-[var(--color-border)]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * The "Detaylar" drill-down: one run's progress and the events it logged.
 *
 * Reads the same way whether the run is live or finished — the only difference is that a live
 * one keeps changing under the poll. Everything shown is read back from `job_runs` and
 * `app_events`; the browser never talks to the worker.
 */
function RunDetailPanel({
  detail,
  error,
  hasRun,
  nowMs,
}: {
  detail: RunDetail | null;
  error: string | null;
  hasRun: boolean;
  nowMs: number;
}) {
  if (error) return <p className="py-2 text-xs text-[var(--color-danger)]">{error}</p>;
  if (!hasRun) {
    return <p className="py-2 text-xs text-[var(--color-muted)]">Bu iş hiç çalışmadı — henüz gösterilecek bir çalışma yok.</p>;
  }
  if (!detail) return <p className="py-2 text-xs text-[var(--color-muted)]">Yükleniyor…</p>;

  const { run, events } = detail;
  const running = run.state === 'running';
  const elapsedMs = (run.finishedAt ?? nowMs) - run.startedAt;
  // A running job whose heartbeat has gone quiet. Distinguishing this from "slow" matters:
  // a rate-limited scrape is *meant* to be slow, but a silent one usually means the worker
  // died mid-run and the row will not be closed out until its claim expires.
  const stalled = running && run.progressAt !== null && nowMs - run.progressAt > STALL_AFTER_MS;

  return (
    <div className="space-y-3 rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">
          {running ? 'Çalışıyor' : run.state === 'failed' ? 'Başarısız' : 'Tamamlandı'} ·{' '}
          <span className="text-[var(--color-muted)]">{formatDateTime(run.startedAt)}</span>
        </span>
        <span className="text-[var(--color-muted)]">
          {formatDuration(elapsedMs)} {running ? 'geçti' : 'sürdü'}
        </span>
      </div>

      <ProgressBar done={run.itemsDone} total={run.itemsTotal} />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
        <span>
          {formatNumber(run.itemsDone)} / {run.itemsTotal > 0 ? formatNumber(run.itemsTotal) : '?'} öğe
        </span>
        {/* Only meaningful once the run has settled: `finishJobRun` writes both counters at the
            end, so mid-run they are still 0 and showing them would read as "everything failed". */}
        {!running && (
          <>
            <span className="text-[var(--color-success)]">{formatNumber(run.itemsOk)} başarılı</span>
            {run.itemsFailed > 0 && (
              <span className="text-[var(--color-danger)]">{formatNumber(run.itemsFailed)} başarısız</span>
            )}
          </>
        )}
      </div>

      {running && (
        <p className="truncate text-xs">
          <span className="text-[var(--color-muted)]">Şu an: </span>
          {run.currentItem ?? <span className="text-[var(--color-muted)]">hazırlanıyor…</span>}
        </p>
      )}

      {stalled && (
        <p className="text-xs text-[var(--color-warning)]">
          {formatDuration(nowMs - (run.progressAt ?? nowMs))} önce ilerleme bildirildi — iş takılmış ya da
          worker durmuş olabilir.
        </p>
      )}

      {run.error && <p className="text-xs text-[var(--color-danger)]">{run.error}</p>}

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Olaylar
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Bu çalışma için kayıt yok.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-surface)] font-mono text-xs">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2 border-b border-[var(--color-border)] px-2 py-1 last:border-b-0">
                <span className="shrink-0 text-[var(--color-muted)]">{formatTime(e.at)}</span>
                <span className={`shrink-0 ${EVENT_LEVEL_CLASS[e.level] ?? ''}`}>{e.code}</span>
                <span className="break-all">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function JobsClient() {
  const [overview, setOverview] = useState<JobsOverview | null>(null);
  const [marketplaces, setMarketplaces] = useState<MarketplaceOption[]>([]);
  const [runHistory, setRunHistory] = useState<JobRunRow[]>([]);
  const [historyLimit, setHistoryLimit] = useState<number | null>(null);
  const [historyFilter, setHistoryFilter] = useState<{ jobName: string; state: string }>({
    jobName: '',
    state: '',
  });
  const [selectedMarketplace, setSelectedMarketplace] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrapeRates, setScrapeRates] = useState<ScrapeRateRow[]>([]);
  const [scrapeRateDraft, setScrapeRateDraft] = useState<Record<string, { requestsPerMinute: string; burst: string }>>(
    {},
  );
  const [scrapeRateSaved, setScrapeRateSaved] = useState<string | null>(null);
  /** Draft cadence per job, in **seconds** (fine enough for both the 30s and 60min defaults). */
  const [cadenceDraft, setCadenceDraft] = useState<Record<string, string>>({});
  const [cadenceSaved, setCadenceSaved] = useState<string | null>(null);
  /** Which job's detail panel is open, if any. One at a time — it is a drill-down, not a dashboard. */
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  /**
   * Jobs this browser has just enqueued, by the time of the click. Bridges the gap between the
   * POST returning and the worker's next tick writing something the overview can see — without
   * it the button springs back to "Çalıştır" and the click looks like it did nothing, which is
   * exactly the complaint this screen had.
   */
  const [pendingRuns, setPendingRuns] = useState<Record<string, number>>({});
  /** Ticks once a second so elapsed times and the stall warning advance between polls. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  // The run log is the only unbounded list on this screen; the catalogue and the rate table are
  // one row per job and per marketplace. `resetKey` restarts at page 1 on a filter change but
  // not on the poll, which would otherwise drag the operator back to page 1 every few seconds.
  const pagedHistory = usePagedRows(runHistory, {
    pageSize: 25,
    resetKey: `${historyFilter.jobName}|${historyFilter.state}`,
  });

  const loadScrapeRates = () => {
    fetch('/api/jobs/scrape-rate')
      .then((r) => r.json())
      .then((data: { rates: ScrapeRateRow[] }) => {
        setScrapeRates(data.rates);
        setScrapeRateDraft((prev) => {
          const next = { ...prev };
          for (const rate of data.rates) {
            if (!next[rate.marketplaceCode]) {
              next[rate.marketplaceCode] = {
                requestsPerMinute: String(rate.requestsPerMinute),
                burst: String(rate.burst),
              };
            }
          }
          return next;
        });
      })
      .catch((e) => setError(String(e)));
  };

  const loadOverview = useCallback(() => {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((data: JobsOverview) => {
        setOverview(data);
        // Seed the cadence draft from the effective value, once per job — an in-progress edit
        // must never be clobbered by the next poll.
        setCadenceDraft((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const job of data.jobs) {
            if (job.cadenceMs !== null && !(job.jobName in next)) {
              next[job.jobName] = String(Math.round(job.cadenceMs / 1000));
              changed = true;
            }
          }
          return changed ? next : prev;
        });
        // The worker has now spoken for these jobs (queued or running), so the optimistic
        // "Kuyruğa alındı" is no longer needed — and must be dropped, or the button would stay
        // disabled after the run finished.
        setPendingRuns((prev) => {
          const next: Record<string, number> = {};
          let changed = false;
          for (const [jobName, at] of Object.entries(prev)) {
            const job = data.jobs.find((j) => j.jobName === jobName);
            const acknowledged = job?.queued || job?.activeRun != null;
            if (acknowledged || Date.now() - at > ENQUEUE_ACK_TIMEOUT_MS) {
              changed = true;
              continue;
            }
            next[jobName] = at;
          }
          return changed ? next : prev;
        });
      })
      .catch((e) => setError(String(e)));
  }, []);

  const loadHistory = () => {
    const params = new URLSearchParams();
    if (historyFilter.jobName) params.set('jobName', historyFilter.jobName);
    if (historyFilter.state) params.set('state', historyFilter.state);
    fetch(`/api/jobs/run-history?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { runs: JobRunRow[]; limit: number }) => {
        setRunHistory(data.runs);
        setHistoryLimit(data.limit);
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    loadOverview();
    loadScrapeRates();
    fetch('/api/settings/marketplaces')
      .then((r) => r.json())
      .then((data: { marketplaces: MarketplaceOption[] }) => setMarketplaces(data.marketplaces))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [historyFilter]);

  const anythingActive =
    (overview?.jobs.some((j) => j.queued || j.activeRun !== null) ?? false) ||
    Object.keys(pendingRuns).length > 0;

  // Overview poll. Backgrounded tabs skip the fetch entirely: nobody is looking, and this page
  // is often left open all day on an operator's second monitor. An open detail panel is
  // deliberately *not* a reason to poll fast — a panel on a finished run has nothing left to
  // report, and a new run starting is worth noticing within the idle interval, after which
  // `anythingActive` speeds everything back up on its own.
  useEffect(() => {
    const intervalMs = anythingActive ? OVERVIEW_POLL_ACTIVE_MS : OVERVIEW_POLL_IDLE_MS;
    const handle = setInterval(() => {
      if (document.visibilityState === 'visible') loadOverview();
    }, intervalMs);
    return () => clearInterval(handle);
  }, [anythingActive, loadOverview]);

  // Second-resolution clock for elapsed times, only while there is something whose elapsed
  // time is changing.
  useEffect(() => {
    if (!anythingActive) return;
    const handle = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [anythingActive]);

  const expandedRow = overview?.jobs.find((j) => j.jobName === expandedJob) ?? null;
  // Prefer the live run; fall back to the last finished one so "Detaylar" is useful on an idle
  // job too — the operator's usual question is "what did the last run actually do?".
  const watchedRunId = expandedRow ? (expandedRow.activeRun?.id ?? expandedRow.lastRun?.id ?? null) : null;
  /** Whether the open panel has anything left to watch. A finished run does not change again. */
  const detailIsLive = expandedRow !== null && isJobBusy(expandedRow);

  // Detail poll. Keyed on the run id, so when a live run finishes and the next one starts the
  // panel follows it rather than freezing on a stale id. Keyed on `detailIsLive` too, so a
  // panel left open on a finished run loads once and then stops: without that it re-fetched an
  // immutable row every second for as long as the tab stayed open, which is how it was found.
  useEffect(() => {
    if (!expandedJob || !watchedRunId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetch(`/api/jobs/run-detail?runId=${encodeURIComponent(watchedRunId)}`)
        .then((r) => r.json())
        .then((data: RunDetail & { error?: string }) => {
          if (cancelled) return;
          if (data.error) {
            setDetailError(data.error);
            return;
          }
          setDetailError(null);
          setDetail({ run: data.run, events: data.events });
        })
        .catch((e) => {
          if (!cancelled) setDetailError(String(e));
        });
    };
    // Always load once — including on the transition to not-live, which is what fetches the
    // settled counters and the final events the moment the run ends.
    load();
    if (!detailIsLive) {
      return () => {
        cancelled = true;
      };
    }
    const handle = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, DETAIL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [expandedJob, watchedRunId, detailIsLive]);

  function toggleDetails(job: JobRow) {
    setDetailError(null);
    setDetail(null);
    setExpandedJob((prev) => (prev === job.jobName ? null : job.jobName));
  }

  /** Queued, claimed or running — every state in which a second click would only pile up work. */
  function isJobBusy(job: JobRow): boolean {
    return job.queued || job.activeRun !== null || pendingRuns[job.jobName] !== undefined;
  }

  async function runNow(job: JobRow) {
    setBusy(job.jobName);
    setError(null);
    // Optimistic, and immediate: the worker needs up to one scheduler tick to notice the row,
    // and the operator needs to know *now* that the click landed.
    setPendingRuns((prev) => ({ ...prev, [job.jobName]: Date.now() }));
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
      // Open the detail panel on the job just started: the operator clicked Run because they
      // wanted to watch it, and this is the whole point of the panel.
      setDetail(null);
      setDetailError(null);
      setExpandedJob(job.jobName);
      loadOverview();
      loadHistory();
    } catch (e) {
      // Nothing was enqueued, so the optimistic state must come straight back off — otherwise
      // the button stays disabled for `ENQUEUE_ACK_TIMEOUT_MS` over a request that never landed.
      setPendingRuns((prev) => {
        const next = { ...prev };
        delete next[job.jobName];
        return next;
      });
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

  async function saveScrapeRate(marketplaceCode: string) {
    const draft = scrapeRateDraft[marketplaceCode];
    if (!draft) return;
    const requestsPerMinute = Number(draft.requestsPerMinute);
    const burst = Number(draft.burst);
    setBusy(`scrape-rate-${marketplaceCode}`);
    setScrapeRateSaved(null);
    setError(null);
    try {
      const res = await fetch('/api/jobs/scrape-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceCode, requestsPerMinute, burst }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Bilinmeyen hata');
      loadScrapeRates();
      setScrapeRateSaved(marketplaceCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Stores a cadence override. Takes effect on the worker's next restart, not live — the same
   * startup-time-read semantics `saveScrapeRate` already has, so no different UI promise here.
   */
  async function saveCadence(jobName: string) {
    const seconds = Number(cadenceDraft[jobName]);
    setBusy(`cadence-${jobName}`);
    setCadenceSaved(null);
    setError(null);
    try {
      const res = await fetch('/api/jobs/cadence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName, cadenceMs: seconds * 1000 }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Bilinmeyen hata');
      loadOverview();
      setCadenceSaved(jobName);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function resetCadence(jobName: string) {
    setBusy(`cadence-${jobName}`);
    setCadenceSaved(null);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/cadence?jobName=${encodeURIComponent(jobName)}`, { method: 'DELETE' });
      const data = (await res.json()) as { ok?: boolean; error?: string; cadenceMs?: number };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Bilinmeyen hata');
      // The next poll would re-seed this from the overview anyway, but dropping it now means the
      // input shows the restored default immediately rather than after the next poll tick.
      setCadenceDraft((prev) => {
        const next = { ...prev };
        delete next[jobName];
        return next;
      });
      loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          Sıklık değişiklikleri worker&apos;ın bir sonraki yeniden başlatılmasında etkili olur, anında değil.
        </p>
        <TableFrame>
          <table className="w-full text-sm">
            <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-[var(--color-muted)]`}>
              <tr>
                <th className="px-3 py-2">İş</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Sıklık</th>
                <th className="px-3 py-2">Son Çalışma</th>
                <th className="px-3 py-2">Sonraki Çalışma</th>
                <th className="px-3 py-2">Etkin</th>
                <th className="px-3 py-2">Şimdi Çalıştır</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {overview.jobs.map((job) => (
                <Fragment key={job.jobName}>
                <tr className={expandedJob === job.jobName ? 'bg-[var(--color-surface)]' : undefined}>
                  <td className="px-3 py-2 font-medium">{job.label}</td>
                  <td className="px-3 py-2">
                    {job.activeRun ? (
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-accent)]">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
                        Çalışıyor
                        {job.activeRun.itemsTotal > 0 && (
                          <span className="text-xs text-[var(--color-muted)]">
                            {job.activeRun.itemsDone}/{job.activeRun.itemsTotal}
                          </span>
                        )}
                      </span>
                    ) : isJobBusy(job) ? (
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-warning)]">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-warning)]" />
                        Kuyrukta
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted)]">Boşta</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {job.cadenceMs === null ? (
                      <span className="text-[var(--color-muted)]">{formatCadence(job.cadenceMs)}</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={10}
                          step={1}
                          className="w-16 rounded border border-[var(--color-border)] px-1 py-0.5 text-xs"
                          value={cadenceDraft[job.jobName] ?? String(Math.round(job.cadenceMs / 1000))}
                          onChange={(e) =>
                            setCadenceDraft((prev) => ({ ...prev, [job.jobName]: e.target.value }))
                          }
                        />
                        <span className="text-xs text-[var(--color-muted)]">sn</span>
                        <button
                          type="button"
                          disabled={busy === `cadence-${job.jobName}`}
                          onClick={() => saveCadence(job.jobName)}
                          className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-xs text-white"
                        >
                          Kaydet
                        </button>
                        {job.isCadenceOverride && (
                          <button
                            type="button"
                            disabled={busy === `cadence-${job.jobName}`}
                            onClick={() => resetCadence(job.jobName)}
                            className="rounded bg-slate-300 px-1.5 py-0.5 text-xs text-slate-700"
                          >
                            Varsayılana dön
                          </button>
                        )}
                        {cadenceSaved === job.jobName && (
                          <span className="text-xs text-[var(--color-success)]">Kaydedildi</span>
                        )}
                        <span className="text-xs text-[var(--color-muted)]">
                          (şu an: {formatCadence(job.cadenceMs)}
                          {job.isCadenceOverride ? '' : ', varsayılan'})
                        </span>
                      </div>
                    )}
                  </td>
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
                        // Disabled while the job is queued or running, not merely while this
                        // browser's POST is in flight: a second click would enqueue a second
                        // row, and for `ScrapeCompetitors` that means two concurrent sweeps
                        // hitting the same public pages — the pattern that risks a block
                        // (api-references §1.6).
                        disabled={
                          busy === job.jobName ||
                          isJobBusy(job) ||
                          (job.perMarketplace && marketplaces.length === 0)
                        }
                        onClick={() => runNow(job)}
                        className="rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {job.activeRun ? 'Çalışıyor…' : isJobBusy(job) ? 'Kuyruğa alındı' : 'Çalıştır'}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDetails(job)}
                        aria-expanded={expandedJob === job.jobName}
                        className="rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface)]"
                      >
                        {expandedJob === job.jobName ? 'Detayları gizle' : 'Detaylar'}
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedJob === job.jobName && (
                  <tr className="bg-[var(--color-surface)]">
                    <td colSpan={7} className="px-3 pb-4 pt-0">
                      <RunDetailPanel
                        detail={detail}
                        error={detailError}
                        hasRun={watchedRunId !== null}
                        nowMs={nowMs}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </TableFrame>
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
          Tarama Hızı (Rakip Verisi Toplama)
        </h2>
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          Bu değerler yalnızca raporlama amaçlı rakip taramasının (ScrapeCompetitors) pazaryerine gönderdiği
          istek hızını belirler; fiyatlandırma kararlarını etkilemez. 403 hataları sıklaşırsa istek/dakika
          değerini düşürün. Değişiklik, worker bir sonraki başlatıldığında etkin olur.
        </p>
        <TableFrame maxHeight="50vh">
          <table className="w-full text-sm">
            <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-[var(--color-muted)]`}>
              <tr>
                <th className="px-3 py-2">Pazaryeri</th>
                <th className="px-3 py-2">İstek/Dakika</th>
                <th className="px-3 py-2">Patlama (burst)</th>
                <th className="px-3 py-2">Varsayılan</th>
                <th className="px-3 py-2">Kaydet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {scrapeRates.map((rate) => (
                <tr key={rate.marketplaceCode}>
                  <td className="px-3 py-2 font-medium">{rate.marketplaceCode}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      className="w-20 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
                      value={scrapeRateDraft[rate.marketplaceCode]?.requestsPerMinute ?? ''}
                      onChange={(e) =>
                        setScrapeRateDraft((prev) => ({
                          ...prev,
                          [rate.marketplaceCode]: {
                            requestsPerMinute: e.target.value,
                            burst: prev[rate.marketplaceCode]?.burst ?? String(rate.burst),
                          },
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      className="w-20 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
                      value={scrapeRateDraft[rate.marketplaceCode]?.burst ?? ''}
                      onChange={(e) =>
                        setScrapeRateDraft((prev) => ({
                          ...prev,
                          [rate.marketplaceCode]: {
                            requestsPerMinute:
                              prev[rate.marketplaceCode]?.requestsPerMinute ?? String(rate.requestsPerMinute),
                            burst: e.target.value,
                          },
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {rate.default.requestsPerMinute}/dk, patlama {rate.default.burst}
                    {rate.isOverride ? ' (özelleştirildi)' : ''}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={busy === `scrape-rate-${rate.marketplaceCode}`}
                      onClick={() => saveScrapeRate(rate.marketplaceCode)}
                      className="rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface)]"
                    >
                      Kaydet
                    </button>
                    {scrapeRateSaved === rate.marketplaceCode && (
                      <span className="ml-2 text-xs text-[var(--color-success)]">Kaydedildi</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
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
        <TableFrame>
          <table className="w-full text-sm">
            <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-[var(--color-muted)]`}>
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
              {pagedHistory.rows.map((r) => (
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
        </TableFrame>
        <div className="mt-2">
          <Pagination state={pagedHistory} label="çalışma">
            {historyLimit !== null && runHistory.length >= historyLimit && (
              <> — en yeni {historyLimit} çalışma gösteriliyor</>
            )}
          </Pagination>
        </div>
      </section>
    </div>
  );
}
