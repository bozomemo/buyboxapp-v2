'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  type ColumnDef,
  ColumnMenu,
  Pagination,
  resizableTableStyle,
  ResizableTh,
  STICKY_HEAD,
  TableFrame,
  useColumnPrefs,
  usePagedRows,
} from '@/components/table';
import { SweepPassCard } from '@/components/sweep-pass-card';
import { EmptyState, ErrorState, LoadingState, Section } from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatDuration, formatNumber, formatTime } from '@/lib/format';
import { CIRCUIT_LABELS, JOB_LABELS, JOB_RUN_STATE_LABELS, labelOf } from '@/lib/labels';

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
  /** What the running worker actually fires this job at; `null` when no worker runs here. */
  liveCadenceMs: number | null;
  /** The saved cadence is not the one running — a worker restart would apply it. */
  pendingRestart: boolean;
  isCadenceOverride: boolean;
  defaultCadenceMs: number | null;
  perMarketplace: boolean;
  defaultPayload: Record<string, unknown>;
  enabled: boolean;
  /** doc 17 §1.3: the job belongs to a disabled module and is not dispatched, whatever `enabled` says. */
  moduleDisabled?: boolean;
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

/**
 * Why the queue might not be moving. Every field here has, at least once, held every job in the
 * system while this screen showed a perfectly ordinary "Kuyrukta" and no error anywhere.
 */
interface SchedulerStatus {
  running: boolean;
  systemPaused: boolean;
  databaseTarget?: string;
  lastTickAt?: string;
  msSinceLastTick?: number;
  lastTickOutcome?: string;
}

interface JobsOverview {
  jobs: JobRow[];
  scheduler?: SchedulerStatus;
  queueDepth: Record<string, number>;
  claimed: ClaimedJob[];
  circuitBreakers: CircuitBreakerRow[];
}

/**
 * The banner that answers "why is nothing running?" in one line.
 *
 * Returns nothing when the scheduler is ticking normally — a healthy system should not carry a
 * status bar it never needs. `GET /api/jobs` always sends `scheduler` (`app/api/jobs/route.ts`
 * spreads `getWorkerStatus()` unconditionally); `status === undefined` here only means the
 * overview has not loaded yet, never a split deployment. `running: false` inside it is the
 * signal for "no worker in this process".
 */
function SchedulerBanner({ status }: { status: SchedulerStatus | undefined }) {
  if (!status) return null;

  let message: string | undefined;
  if (status.systemPaused) {
    message = 'Genel durdurma açık — hiçbir iş çalışmıyor. Panel ekranından devam ettirin.';
  } else if (!status.running) {
    message = 'Worker çalışmıyor — kuyruktaki işleri alacak kimse yok. Servis günlüğünü kontrol edin.';
  } else if (status.msSinceLastTick !== undefined && status.msSinceLastTick > 60_000) {
    message = `Worker ${Math.round(status.msSinceLastTick / 1000)} saniyedir tick atmadı — kuyruk ilerlemiyor olabilir.`;
  } else if (status.lastTickOutcome === 'unlicensed') {
    message = 'Lisans geçersiz veya süresi dolmuş — scheduler hiçbir iş çalıştırmıyor.';
  } else if (status.lastTickOutcome === 'no-lock') {
    message = 'Scheduler kilidi başka bir instance’da — bu süreç hiçbir iş çalıştırmıyor.';
  }

  if (!message) return null;
  return (
    <div className="rounded border border-(--color-warning) bg-(--color-warning-bg) px-4 py-3 text-sm">
      {message}
      {status.databaseTarget && (
        <div className="mt-1 text-xs text-(--color-muted)">Worker veritabanı: {status.databaseTarget}</div>
      )}
    </div>
  );
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
  requestTimeoutMs: number;
  isOverride: boolean;
  default: { requestsPerMinute: number; burst: number; requestTimeoutMs: number };
}

/**
 * Column preferences and CSV export (R-UI-12/13) apply here, and deliberately nowhere else on
 * this screen (sweep report §2.2). The job catalogue and the circuit-breaker list are one row
 * per job or per marketplace — a fixed handful of control rows, not data an operator slices or
 * exports — and the scrape-rate table is the same shape again, behind its own `<details>`. Run
 * history is the one genuine grid here: unbounded, growing, and the thing doc 15 §6 2.1 names as
 * this screen's own "iş takılmış mı" question turning into "ne zaman ve ne sıklıkla başarısız
 * oluyor" once an operator wants to look across more than the visible page.
 */
type RunHistoryColumnId = 'jobName' | 'startedAt' | 'duration' | 'state' | 'items' | 'error';

const RUN_HISTORY_COLUMNS: ColumnDef<RunHistoryColumnId>[] = [
  { id: 'jobName', label: 'İş', defaultWidth: 160 },
  { id: 'startedAt', label: 'Başlangıç', defaultWidth: 140 },
  { id: 'duration', label: 'Süre', defaultWidth: 80 },
  { id: 'state', label: 'Durum', defaultWidth: 100 },
  { id: 'items', label: 'Öğeler', defaultWidth: 140 },
  { id: 'error', label: 'Hata', defaultWidth: 220 },
];

function formatCadence(ms: number | null): string {
  if (ms === null) return 'Yalnızca manuel';
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} saatte bir`;
  if (ms % 60_000 === 0) return `${ms / 60_000} dakikada bir`;
  return `${ms / 1000} saniyede bir`;
}

const EVENT_LEVEL_CLASS: Record<string, string> = {
  error: 'text-(--color-danger)',
  warn: 'text-(--color-warning)',
  info: 'text-(--color-muted)',
  debug: 'text-(--color-muted)',
};

/**
 * The live progress bar. Two shapes, because "0 of 0" and "0 of 200" mean different things:
 * with a known total it fills; before the handler has reported one (a scrape spends its first
 * seconds deciding which listings are even due) it animates without claiming a percentage.
 */
function ProgressBar({ done, total }: { done: number; total: number }) {
  if (total <= 0) {
    return (
      <div className="h-2 w-full overflow-hidden rounded bg-(--color-border)">
        <div className="h-full w-1/3 animate-pulse rounded bg-(--color-accent)" />
      </div>
    );
  }
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded bg-(--color-border)"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded bg-(--color-accent) transition-[width] duration-500 ease-out"
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
  if (error) return <p className="py-2 text-xs text-(--color-danger)">{error}</p>;
  if (!hasRun) {
    return (
      <p className="py-2 text-xs text-(--color-muted)">
        Bu iş hiç çalışmadı — henüz gösterilecek bir çalışma yok.
      </p>
    );
  }
  if (!detail) return <p className="py-2 text-xs text-(--color-muted)">Yükleniyor…</p>;

  const { run, events } = detail;
  const running = run.state === 'running';
  const elapsedMs = (run.finishedAt ?? nowMs) - run.startedAt;
  // A running job whose heartbeat has gone quiet. Distinguishing this from "slow" matters:
  // a rate-limited scrape is *meant* to be slow, but a silent one usually means the worker
  // died mid-run and the row will not be closed out until its claim expires.
  const stalled = running && run.progressAt !== null && nowMs - run.progressAt > STALL_AFTER_MS;

  return (
    <div className="space-y-3 rounded border border-(--color-border) bg-(--color-bg) p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">
          {running ? 'Çalışıyor' : run.state === 'failed' ? 'Başarısız' : 'Tamamlandı'} ·{' '}
          <span className="text-(--color-muted)">{formatDateTime(run.startedAt)}</span>
        </span>
        <span className="text-(--color-muted)">
          {formatDuration(elapsedMs)} {running ? 'geçti' : 'sürdü'}
        </span>
      </div>

      <ProgressBar done={run.itemsDone} total={run.itemsTotal} />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-muted)">
        <span>
          {formatNumber(run.itemsDone)} / {run.itemsTotal > 0 ? formatNumber(run.itemsTotal) : '?'} öğe
        </span>
        {/* Only meaningful once the run has settled: `finishJobRun` writes both counters at the
            end, so mid-run they are still 0 and showing them would read as "everything failed". */}
        {!running && (
          <>
            <span className="text-(--color-success)">{formatNumber(run.itemsOk)} başarılı</span>
            {run.itemsFailed > 0 && (
              <span className="text-(--color-danger)">{formatNumber(run.itemsFailed)} başarısız</span>
            )}
          </>
        )}
      </div>

      {running && (
        <p className="truncate text-xs">
          <span className="text-(--color-muted)">Şu an: </span>
          {run.currentItem ?? <span className="text-(--color-muted)">hazırlanıyor…</span>}
        </p>
      )}

      {stalled && (
        <p className="text-xs text-(--color-warning)">
          {formatDuration(nowMs - (run.progressAt ?? nowMs))} önce ilerleme bildirildi — iş takılmış ya da
          worker durmuş olabilir.
        </p>
      )}

      {run.error && <p className="text-xs text-(--color-danger)">{run.error}</p>}

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-(--color-muted)">Olaylar</div>
        {events.length === 0 ? (
          <p className="text-xs text-(--color-muted)">Bu çalışma için kayıt yok.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto rounded border border-(--color-border) bg-(--color-surface) font-mono text-xs">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex gap-2 border-b border-(--color-border) px-2 py-1 last:border-b-0"
              >
                <span className="shrink-0 text-(--color-muted)">{formatTime(e.at)}</span>
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
  /** An action's own failure (run-now, save, reset…) — shown as a banner near the top. */
  const [error, setError] = useState<string | null>(null);
  /**
   * `/api/jobs` itself failing, kept apart from `error` above. Before this screen had no way to
   * distinguish "the overview never loaded" from "a button click failed" — both fell into one
   * `error` string, and the initial-load case additionally could never reach the render that
   * would have shown it (see the early return below).
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scrapeRates, setScrapeRates] = useState<ScrapeRateRow[]>([]);
  /** Timeout is drafted in **seconds** — it is read and typed in seconds, and stored in ms. */
  const [scrapeRateDraft, setScrapeRateDraft] = useState<
    Record<string, { requestsPerMinute: string; burst: string; timeoutSeconds: string }>
  >({});
  const [scrapeRateSaved, setScrapeRateSaved] = useState<string | null>(null);
  /** Draft cadence per job, in **seconds** (fine enough for both the 30s and 60min defaults). */
  const [cadenceDraft, setCadenceDraft] = useState<Record<string, string>>({});
  const [cadenceSaved, setCadenceSaved] = useState<string | null>(null);
  const [restartResult, setRestartResult] = useState<{ ok: boolean; message: string } | null>(null);
  /** Which job's detail panel is open, if any. One at a time — it is a drill-down, not a dashboard. */
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  // A disabled module's jobs are kept out of the way rather than removed (doc 17 §1.3): a
  // brand-only install otherwise opened this screen on nine price jobs it will never run, with its
  // own jobs below them.
  const [showModuleDisabledJobs, setShowModuleDisabledJobs] = useState(false);
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
  const runHistoryColumns = useColumnPrefs('jobs-run-history-columns-v1', RUN_HISTORY_COLUMNS);
  const visibleRunHistoryColumns = useMemo(
    () => RUN_HISTORY_COLUMNS.filter((d) => runHistoryColumns.isVisible(d.id)),
    [runHistoryColumns],
  );

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
                timeoutSeconds: String(Math.round(rate.requestTimeoutMs / 1000)),
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
        setLoadError(null);
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
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
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
    const requestTimeoutMs = Math.round(Number(draft.timeoutSeconds) * 1000);
    setBusy(`scrape-rate-${marketplaceCode}`);
    setScrapeRateSaved(null);
    setError(null);
    try {
      const res = await fetch('/api/jobs/scrape-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaceCode, requestsPerMinute, burst, requestTimeoutMs }),
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
      const res = await fetch(`/api/jobs/cadence?jobName=${encodeURIComponent(jobName)}`, {
        method: 'DELETE',
      });
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

  /**
   * Applies every saved-but-not-running cadence by restarting the worker in place (doc 07 §8.1).
   * Not a service restart: this page keeps its connection and shows the outcome, which is the
   * whole point of the button existing rather than an instruction to open PowerShell.
   */
  async function restartWorker() {
    setBusy('worker-restart');
    setRestartResult(null);
    setError(null);
    try {
      const res = await fetch('/api/jobs/worker/restart', { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      // A failed restart leaves the worker stopped; `loadOverview` refreshes the scheduler
      // banner, which reports that far more usefully than this line can.
      setRestartResult({ ok: res.ok && data.ok === true, message: data.message ?? 'Bilinmeyen hata' });
      loadOverview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /**
   * The currently loaded page of run history — the same rows `historyFilter` already narrowed
   * server-side, not the full unbounded table (there is no "full table" to have: `/api/jobs/run-
   * history` itself is capped at `historyLimit`, per doc 07). An operator exporting after
   * filtering to one job's failures wants that filtered set, not everything else mixed back in.
   */
  function exportRunHistoryCsv() {
    downloadCsv(
      'is-gecmisi.csv',
      runHistory.map((r) => ({
        İş: labelOf(JOB_LABELS, r.jobName),
        Başlangıç: formatDateTime(r.startedAt),
        'Süre (sn)': r.finishedAt ? ((r.finishedAt - r.startedAt) / 1000).toFixed(1) : '',
        Durum: labelOf(JOB_RUN_STATE_LABELS, r.state),
        Başarılı: r.itemsOk,
        Toplam: r.itemsTotal,
        Başarısız: r.itemsFailed,
        Hata: r.error ?? '',
      })),
    );
  }

  // Primary load failed and nothing has ever been shown — the six-states contract (doc 15 §3.2)
  // requires this to be reachable and retryable. Before this fix `!overview` was checked first,
  // so a failed first load left the operator on a permanent "Yükleniyor…" with no error and no
  // way to retry short of reloading the page.
  if (!overview && loadError) {
    return <ErrorState message={loadError} onRetry={loadOverview} />;
  }
  if (!overview) {
    return <LoadingState message="İşler yükleniyor…" skeletonRows={4} />;
  }

  const pendingRestartCount = overview.jobs.filter((job) => job.pendingRestart).length;
  const runningCount = overview.jobs.filter((job) => job.activeRun !== null).length;
  const moduleDisabledCount = overview.jobs.filter((job) => job.moduleDisabled).length;
  const catalogJobs = showModuleDisabledJobs
    ? overview.jobs
    : overview.jobs.filter((job) => !job.moduleDisabled);

  return (
    <div className="space-y-8">
      {error && (
        <p role="alert" className="text-(--color-danger)">
          {error}
        </p>
      )}
      {/* A poll after the screen already has data failed — the data below is real but ageing.
          Silently going quiet here (the old behaviour) is how a stuck screen looks fine. */}
      {loadError && (
        <p
          role="alert"
          className="rounded border border-(--color-warning) bg-(--color-warning-bg) px-3 py-2 text-sm"
        >
          Son yenileme başarısız oldu ({loadError}). Aşağıdaki bilgiler artık güncel olmayabilir.
        </p>
      )}
      <SchedulerBanner status={overview.scheduler} />

      {/* Two lanes, one shared rate limiter (doc 07 §7.5, doc 17 §4.2): the catalogue sweep and
          the İlanlar sweep number their passes separately, so each marketplace gets both bars. */}
      {scrapeRates.length > 0 && (
        <Section id="sweep-passes" title="Tarama Turları">
          <div className="space-y-3">
            {scrapeRates.map((rate) => (
              <div key={rate.marketplaceCode} className="space-y-2">
                <p className="text-xs font-medium text-(--color-muted)">{rate.marketplaceCode}</p>
                <SweepPassCard marketplaceCode={rate.marketplaceCode} scope="all" label="Tarama turu" />
                <SweepPassCard marketplaceCode={rate.marketplaceCode} scope="listed" label="İlanlar turu" />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section id="job-catalog" title="İş Kataloğu">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-(--color-muted)">
            Sıklık değişiklikleri worker yeniden başlatılınca etkili olur, kaydedilir kaydedilmez değil.
          </p>
          <button
            type="button"
            disabled={busy === 'worker-restart'}
            onClick={restartWorker}
            className={
              pendingRestartCount > 0
                ? 'rounded bg-(--color-warning) px-2 py-1 text-xs font-medium text-(--color-warning-ink)'
                : 'rounded bg-(--color-chip-bg) px-2 py-1 text-xs text-(--color-chip-text)'
            }
          >
            {busy === 'worker-restart'
              ? 'Yeniden başlatılıyor…'
              : pendingRestartCount > 0
                ? `Worker'ı Yeniden Başlat (${pendingRestartCount} bekleyen)`
                : "Worker'ı Yeniden Başlat"}
          </button>
          {/* Running jobs are drained, not killed (`Scheduler.shutdown`), so this is a warning
              about how long the click takes — not about losing work. */}
          {runningCount > 0 && busy !== 'worker-restart' && (
            <span className="text-xs text-(--color-muted)">
              {runningCount} iş çalışıyor — yeniden başlatma bitmelerini bekler.
            </span>
          )}
          {restartResult && (
            <span
              className={`text-xs ${restartResult.ok ? 'text-(--color-success)' : 'text-(--color-danger)'}`}
            >
              {restartResult.message}
            </span>
          )}
        </div>
        <TableFrame>
          <table className="w-full text-sm">
            <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
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
            <tbody className="divide-y divide-(--color-border)">
              {catalogJobs.map((job) => (
                <Fragment key={job.jobName}>
                  <tr className={expandedJob === job.jobName ? 'bg-(--color-surface)' : undefined}>
                    <td className="px-3 py-2 font-medium">{job.label}</td>
                    <td className="px-3 py-2">
                      {job.activeRun ? (
                        <span className="inline-flex items-center gap-1.5 text-(--color-accent)">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-(--color-accent)" />
                          Çalışıyor
                          {job.activeRun.itemsTotal > 0 && (
                            <span className="text-xs text-(--color-muted)">
                              {job.activeRun.itemsDone}/{job.activeRun.itemsTotal}
                            </span>
                          )}
                        </span>
                      ) : isJobBusy(job) ? (
                        <span className="inline-flex items-center gap-1.5 text-(--color-warning)">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-(--color-warning)" />
                          Kuyrukta
                        </span>
                      ) : (
                        <span className="text-(--color-muted)">Boşta</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {job.cadenceMs === null ? (
                        <span className="text-(--color-muted)">{formatCadence(job.cadenceMs)}</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={10}
                            step={1}
                            className="w-16 rounded border border-(--color-border) px-1 py-0.5 text-xs"
                            value={cadenceDraft[job.jobName] ?? String(Math.round(job.cadenceMs / 1000))}
                            onChange={(e) =>
                              setCadenceDraft((prev) => ({ ...prev, [job.jobName]: e.target.value }))
                            }
                          />
                          <span className="text-xs text-(--color-muted)">sn</span>
                          <button
                            type="button"
                            disabled={busy === `cadence-${job.jobName}`}
                            onClick={() => saveCadence(job.jobName)}
                            className="rounded bg-(--color-accent) px-1.5 py-0.5 text-xs text-(--color-accent-ink) disabled:opacity-50"
                          >
                            {busy === `cadence-${job.jobName}` ? 'Kaydediliyor…' : 'Kaydet'}
                          </button>
                          {job.isCadenceOverride && (
                            <button
                              type="button"
                              disabled={busy === `cadence-${job.jobName}`}
                              onClick={() => resetCadence(job.jobName)}
                              className="rounded bg-(--color-chip-bg) px-1.5 py-0.5 text-xs text-(--color-chip-text)"
                            >
                              Varsayılana dön
                            </button>
                          )}
                          {cadenceSaved === job.jobName && (
                            <span className="text-xs text-(--color-success)">Kaydedildi</span>
                          )}
                          {/* Survives a page reload, unlike "Kaydedildi" above: the disagreement
                            is derived from the server's own comparison of the saved cadence
                            against the running worker's, so an operator who saves and comes back
                            tomorrow is still told the value is not in effect. */}
                          {job.pendingRestart ? (
                            <span className="text-xs text-(--color-warning)">
                              ⚠ Kaydedildi, henüz geçerli değil — worker {formatCadence(job.liveCadenceMs)}{' '}
                              çalışıyor. Yeniden başlatın.
                            </span>
                          ) : (
                            <span className="text-xs text-(--color-muted)">
                              (şu an: {formatCadence(job.cadenceMs)}
                              {job.isCadenceOverride ? '' : ', varsayılan'})
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {job.lastRun ? (
                        <span title={formatDateTime(job.lastRun.startedAt)}>
                          {formatDuration(Math.max(0, Date.now() - job.lastRun.startedAt))} önce —{' '}
                          <span
                            className={
                              job.lastRun.state === 'failed'
                                ? 'text-(--color-danger)'
                                : 'text-(--color-muted)'
                            }
                          >
                            {labelOf(JOB_RUN_STATE_LABELS, job.lastRun.state)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-(--color-muted)">Hiç çalışmadı</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-(--color-muted)">
                      {job.nextRunAt === null ? (
                        '—'
                      ) : (
                        <span title={formatDateTime(job.nextRunAt)}>
                          {job.nextRunAt <= Date.now()
                            ? 'şimdi'
                            : `${formatDuration(job.nextRunAt - Date.now())} sonra`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={busy === job.jobName}
                        onClick={() => toggleEnabled(job)}
                        className={
                          job.enabled
                            ? 'rounded bg-(--color-success) px-2 py-1 text-xs text-(--color-success-ink)'
                            : 'rounded bg-(--color-chip-bg) px-2 py-1 text-xs text-(--color-chip-text)'
                        }
                      >
                        {job.enabled ? 'Etkin' : 'Devre dışı'}
                      </button>
                      {job.moduleDisabled && (
                        <Link
                          href="/settings/modules"
                          title="Bu iş kapalı bir modüle ait ve çalışmaz. Modül açıldığında kendi ayarıyla devam eder."
                          className="ml-2 inline-block whitespace-nowrap rounded bg-(--color-chip-bg) px-2 py-1 text-xs text-(--color-chip-text) hover:underline"
                        >
                          Modül kapalı
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {job.perMarketplace && (
                          <select
                            className="rounded border border-(--color-border) px-1 py-0.5 text-xs"
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
                            job.moduleDisabled === true ||
                            (job.perMarketplace && marketplaces.length === 0)
                          }
                          onClick={() => runNow(job)}
                          className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-surface) disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {job.activeRun ? 'Çalışıyor…' : isJobBusy(job) ? 'Kuyruğa alındı' : 'Çalıştır'}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleDetails(job)}
                          aria-expanded={expandedJob === job.jobName}
                          className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-surface)"
                        >
                          {expandedJob === job.jobName ? 'Detayları gizle' : 'Detaylar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedJob === job.jobName && (
                    <tr className="bg-(--color-surface)">
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
        {moduleDisabledCount > 0 && (
          <button
            type="button"
            onClick={() => setShowModuleDisabledJobs((v) => !v)}
            className="mt-2 text-xs text-(--color-accent) hover:underline"
          >
            {showModuleDisabledJobs
              ? `Kapalı modüllerin işlerini gizle (${moduleDisabledCount})`
              : `Kapalı modüllerin ${moduleDisabledCount} işi gizli — göster`}
          </button>
        )}
      </Section>

      {/* Ranked above queue depth: a tripped breaker is a direct answer to "is a job stuck, and
          why" (doc 15 §6 2.1's stated primary task), not a supporting number. */}
      <Section id="circuit-breaker" title="Devre Kesici (Circuit Breaker)">
        {overview.circuitBreakers.length === 0 ? (
          <p className="text-sm text-(--color-muted)">Hiç tetiklenmedi.</p>
        ) : (
          <ul className="divide-y divide-(--color-border) rounded border border-(--color-border) text-sm">
            {overview.circuitBreakers.map((c) => (
              <li key={c.marketplaceCode} className="flex items-center justify-between px-3 py-2">
                <div>
                  <span className="font-medium">{c.marketplaceCode}</span> —{' '}
                  <span className={c.state === 'closed' ? 'text-(--color-muted)' : 'text-(--color-danger)'}>
                    {labelOf(CIRCUIT_LABELS, c.state)}
                  </span>
                  {c.state !== 'closed' && (
                    <span className="ml-2 text-xs text-(--color-muted)">
                      {c.consecutiveFailures} ardışık hata — {c.lastError}
                    </span>
                  )}
                </div>
                {c.state !== 'closed' && (
                  <button
                    type="button"
                    disabled={busy === `circuit-${c.marketplaceCode}`}
                    onClick={() => resetCircuit(c.marketplaceCode)}
                    className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-surface)"
                  >
                    Sıfırla
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* doc 07 §3: a tripped circuit must not silently disable repricing — it's shown, not hidden. */}
        <p className="mt-2 text-xs text-(--color-muted)">
          Devre açıkken ilgili pazaryerine giden istekler duraklatılır; yeniden fiyatlandırma ve diğer işler
          bloke olmaz, yalnızca o pazaryerine giden çağrılar ertelenir.
        </p>
      </Section>

      <Section id="queue" title="Kuyruk Derinliği ve Alınan İşler">
        <div className="flex flex-wrap gap-4">
          {['ready', 'locked', 'done', 'failed'].map((state) => (
            <div key={state} className="rounded border border-(--color-border) px-4 py-2 text-center">
              <div className="text-xl font-bold">{formatNumber(overview.queueDepth[state] ?? 0)}</div>
              <div className="text-xs text-(--color-muted)">{state}</div>
            </div>
          ))}
        </div>
        {overview.claimed.length > 0 && (
          <ul className="mt-3 divide-y divide-(--color-border) rounded border border-(--color-border) text-sm">
            {overview.claimed.map((j) => (
              <li key={j.id} className="flex justify-between px-3 py-2">
                <span>
                  {labelOf(JOB_LABELS, j.jobName)} — {j.lockedBy}
                </span>
                <span className="text-(--color-muted)">
                  {j.attempts}. deneme, kilit bitiş: {formatDateTime(j.lockedUntil)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Config, not triage: touched when 403s show up, not on a daily pass. Closed by default so
          it stops competing for attention with the sections above that actually answer the
          screen's question. */}
      <details className="rounded border border-(--color-border)">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          Tarama Hızı (Rakip Verisi Toplama) — gelişmiş ayar
        </summary>
        <div className="border-t border-(--color-border) p-4">
          <p className="mb-2 text-xs text-(--color-muted)">
            Bu değerler yalnızca raporlama amaçlı rakip taramasının (ScrapeCompetitors) pazaryerine gönderdiği
            istek hızını belirler; fiyatlandırma kararlarını etkilemez. 403 hataları sıklaşırsa istek/dakika
            değerini düşürün. <strong>Zaman aşımı</strong>, tek bir sayfanın açılması için tanınan süredir:
            olay günlüğünde “Timeout … exceeded” hataları görüyorsanız bu makine sayfaları bu sürede
            yükleyemiyor demektir, değeri yükseltin. Değişiklik, worker bir sonraki başlatıldığında etkin
            olur.
          </p>
          <TableFrame maxHeight="50vh">
            <table className="w-full text-sm">
              <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
                <tr>
                  <th className="px-3 py-2">Pazaryeri</th>
                  <th className="px-3 py-2">İstek/Dakika</th>
                  <th className="px-3 py-2">Patlama (burst)</th>
                  <th className="px-3 py-2">Zaman Aşımı (sn)</th>
                  <th className="px-3 py-2">Varsayılan</th>
                  <th className="px-3 py-2">Kaydet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {scrapeRates.map((rate) => (
                  <tr key={rate.marketplaceCode}>
                    <td className="px-3 py-2 font-medium">{rate.marketplaceCode}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        className="w-20 rounded border border-(--color-border) px-2 py-1 text-sm"
                        value={scrapeRateDraft[rate.marketplaceCode]?.requestsPerMinute ?? ''}
                        onChange={(e) =>
                          setScrapeRateDraft((prev) => ({
                            ...prev,
                            [rate.marketplaceCode]: {
                              requestsPerMinute: e.target.value,
                              burst: prev[rate.marketplaceCode]?.burst ?? String(rate.burst),
                              timeoutSeconds:
                                prev[rate.marketplaceCode]?.timeoutSeconds ??
                                String(Math.round(rate.requestTimeoutMs / 1000)),
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        className="w-20 rounded border border-(--color-border) px-2 py-1 text-sm"
                        value={scrapeRateDraft[rate.marketplaceCode]?.burst ?? ''}
                        onChange={(e) =>
                          setScrapeRateDraft((prev) => ({
                            ...prev,
                            [rate.marketplaceCode]: {
                              requestsPerMinute:
                                prev[rate.marketplaceCode]?.requestsPerMinute ??
                                String(rate.requestsPerMinute),
                              burst: e.target.value,
                              timeoutSeconds:
                                prev[rate.marketplaceCode]?.timeoutSeconds ??
                                String(Math.round(rate.requestTimeoutMs / 1000)),
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={2}
                        max={120}
                        className="w-20 rounded border border-(--color-border) px-2 py-1 text-sm"
                        value={scrapeRateDraft[rate.marketplaceCode]?.timeoutSeconds ?? ''}
                        onChange={(e) =>
                          setScrapeRateDraft((prev) => ({
                            ...prev,
                            [rate.marketplaceCode]: {
                              requestsPerMinute:
                                prev[rate.marketplaceCode]?.requestsPerMinute ??
                                String(rate.requestsPerMinute),
                              burst: prev[rate.marketplaceCode]?.burst ?? String(rate.burst),
                              timeoutSeconds: e.target.value,
                            },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-(--color-muted)">
                      {rate.default.requestsPerMinute}/dk, patlama {rate.default.burst},{' '}
                      {Math.round(rate.default.requestTimeoutMs / 1000)} sn
                      {rate.isOverride ? ' (özelleştirildi)' : ''}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={busy === `scrape-rate-${rate.marketplaceCode}`}
                        onClick={() => saveScrapeRate(rate.marketplaceCode)}
                        className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-surface) disabled:opacity-50"
                      >
                        {busy === `scrape-rate-${rate.marketplaceCode}` ? 'Kaydediliyor…' : 'Kaydet'}
                      </button>
                      {scrapeRateSaved === rate.marketplaceCode && (
                        <span className="ml-2 text-xs text-(--color-success)">Kaydedildi</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        </div>
      </details>

      <Section
        id="run-history"
        title="Çalışma Geçmişi"
        action={
          runHistory.length > 0 ? (
            <div className="flex items-center gap-2">
              <ColumnMenu defs={RUN_HISTORY_COLUMNS} prefs={runHistoryColumns} />
              <button
                type="button"
                onClick={exportRunHistoryCsv}
                className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
              >
                Excel&apos;e Aktar
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="mb-2 flex gap-2">
          <select
            className="rounded border border-(--color-border) px-2 py-1 text-sm"
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
            className="rounded border border-(--color-border) px-2 py-1 text-sm"
            value={historyFilter.state}
            onChange={(e) => setHistoryFilter((f) => ({ ...f, state: e.target.value }))}
          >
            <option value="">Tüm durumlar</option>
            <option value="success">{labelOf(JOB_RUN_STATE_LABELS, 'success')}</option>
            <option value="failed">{labelOf(JOB_RUN_STATE_LABELS, 'failed')}</option>
          </select>
        </div>
        {runHistory.length === 0 ? (
          <EmptyState
            message="Henüz çalışma yok."
            reason="Bir işi yukarıdan Çalıştır'a basarak başlatabilir ya da zamanlanmış ilk çalışmayı bekleyebilirsiniz."
          />
        ) : (
          <>
            <TableFrame>
              <table
                className="w-full text-sm"
                style={resizableTableStyle(RUN_HISTORY_COLUMNS, runHistoryColumns)}
              >
                <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
                  <tr>
                    {visibleRunHistoryColumns.map((d) => (
                      <ResizableTh key={d.id} id={d.id} prefs={runHistoryColumns} className="px-3 py-2">
                        {d.label}
                      </ResizableTh>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {pagedHistory.rows.map((r) => (
                    <tr key={r.id}>
                      {visibleRunHistoryColumns.map((d) => {
                        if (d.id === 'jobName') {
                          return (
                            <td key={d.id} className="px-3 py-2">
                              {labelOf(JOB_LABELS, r.jobName)}
                            </td>
                          );
                        }
                        if (d.id === 'startedAt') {
                          // Absolute, deliberately: this row is a log entry — the exact instant
                          // is the point (doc 15 §3.3's own carve-out), not staleness at a glance.
                          return (
                            <td key={d.id} className="px-3 py-2 text-(--color-muted)">
                              {formatDateTime(r.startedAt)}
                            </td>
                          );
                        }
                        if (d.id === 'duration') {
                          return (
                            <td key={d.id} className="px-3 py-2 text-(--color-muted)">
                              {r.finishedAt ? `${((r.finishedAt - r.startedAt) / 1000).toFixed(1)} sn` : '—'}
                            </td>
                          );
                        }
                        if (d.id === 'state') {
                          return (
                            <td
                              key={d.id}
                              className={
                                r.state === 'failed' ? 'px-3 py-2 text-(--color-danger)' : 'px-3 py-2'
                              }
                            >
                              {labelOf(JOB_RUN_STATE_LABELS, r.state)}
                            </td>
                          );
                        }
                        if (d.id === 'items') {
                          return (
                            <td key={d.id} className="px-3 py-2 text-(--color-muted)">
                              {r.itemsOk}/{r.itemsTotal} başarılı
                              {r.itemsFailed > 0 ? `, ${r.itemsFailed} başarısız` : ''}
                            </td>
                          );
                        }
                        return (
                          <td key={d.id} className="px-3 py-2 text-xs text-(--color-danger)">
                            {r.error ?? ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
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
          </>
        )}
      </Section>
    </div>
  );
}
