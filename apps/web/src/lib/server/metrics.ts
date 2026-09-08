/**
 * Prometheus exposition: the pure half of `/api/metrics` (doc 16 §3).
 *
 * Everything in this file is a function from plain rows to a string. It performs no I/O, reads
 * no clock and touches no database — `renderMetrics` is handed a snapshot and a `nowMs`, exactly
 * like the domain core is handed everything it needs (CLAUDE.md). That is what lets the
 * arithmetic have table-driven tests instead of a three-dialect integration test per statistic,
 * which matters here more than usual: a metric that is *wrong* is worse than one that is
 * missing, because someone acts on it.
 *
 * Three rules govern what is emitted, and each of them has already been broken once by somebody
 * writing an exporter:
 *
 * - **Bounded label cardinality.** Every label value below is a job name, a marketplace code, a
 *   state enum or a bucket edge — all closed sets. A listing id or a stock code as a label value
 *   would multiply the series count by the size of the catalogue and is what turns a free tier
 *   into a bill. Nothing user-supplied becomes a label.
 * - **No money, ever.** Money is `bigint` kuruş in this codebase and a Prometheus sample is an
 *   IEEE-754 double. There is no representation of a price here that would not eventually be a
 *   silently rounded one, so prices are simply not exported. Counts of price *submissions* are
 *   fine; the prices themselves stay in the database.
 * - **Absence is not zero.** A gauge is only written for a thing that exists. If the database
 *   cannot be read, the endpoint says so with `buybox_up 0` and emits no job metrics at all,
 *   rather than a confident floor of zeroes that looks exactly like a quiet, healthy night.
 */

export interface MetricsJobRunRow {
  readonly jobName: string;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly state: string;
  readonly itemsOk: number;
  readonly itemsFailed: number;
  readonly itemsTotal: number;
}

export interface MetricsCircuitBreakerRow {
  readonly marketplaceCode: string;
  readonly state: string;
  readonly consecutiveFailures: number;
  readonly openedAt: number | null;
  readonly updatedAt: number;
}

export interface MetricsBudgetRow {
  readonly marketplaceCode: string;
  readonly usageDate: string;
  readonly consumed: number;
  readonly allowance: number;
}

export interface MetricsCountByKey {
  readonly key: string;
  readonly count: number;
}

/**
 * Everything the exposition is rendered from. `database: undefined` is the deliberate
 * representation of "could not read" — see the absence-is-not-zero rule above.
 */
export interface MetricsSnapshot {
  readonly windowMs: number;
  readonly appVersion: string | null;
  readonly processStartedAtMs: number;
  readonly worker: {
    readonly running: boolean;
    readonly msSinceLastTick: number | undefined;
  };
  readonly database:
    | {
        readonly dialect: string;
        readonly schemaUpToDate: boolean;
        readonly jobRuns: readonly MetricsJobRunRow[];
        readonly runningByName: readonly MetricsCountByKey[];
        readonly queueByState: readonly MetricsCountByKey[];
        readonly oldestReadyRunAfterMs: number | undefined;
        readonly eventsByLevel: readonly MetricsCountByKey[];
        readonly lastProblemEventAtMs: number | undefined;
        readonly circuitBreakers: readonly MetricsCircuitBreakerRow[];
        readonly budgets: readonly MetricsBudgetRow[];
      }
    | undefined;
}

/**
 * Histogram bucket edges for job run duration, in seconds.
 *
 * Chosen against this application's actual job shapes rather than from a library default: a
 * price submission is sub-second, a competitor scrape is tens of seconds because it is rate
 * limited on purpose, and a full catalogue sweep is minutes. Buckets that stop at 10s would put
 * every interesting job in `+Inf` and make every percentile meaningless.
 */
export const DURATION_BUCKETS_SECONDS = [0.5, 1, 5, 15, 60, 300, 900, 1800, 3600] as const;

/**
 * `job_runs.state` values that are exported as their own counter series.
 *
 * Listed explicitly, and unknown states are folded into `other` by `countByState`, so that a
 * state added to the job runner later cannot silently vanish from the dashboards — it shows up
 * as a rising `other` line, which is a visible prompt to add it here.
 */
const KNOWN_RUN_STATES = ['succeeded', 'failed', 'running', 'cancelled'] as const;

const KNOWN_QUEUE_STATES = ['ready', 'locked', 'done', 'failed'] as const;

const KNOWN_EVENT_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

const KNOWN_BREAKER_STATES = ['closed', 'open', 'half-open'] as const;

/**
 * Escapes a Prometheus label *value* per the exposition format: backslash, double quote and
 * newline. Applied to every label value without exception — job names come from a code-defined
 * catalogue today, but an exporter that assumes its inputs are clean is one refactor away from
 * emitting a line no scraper can parse, and a malformed line poisons the whole scrape, not just
 * its own metric.
 */
export function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function labels(pairs: Record<string, string>): string {
  const entries = Object.entries(pairs);
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(',')}}`;
}

/**
 * Renders one sample. Non-finite values are dropped rather than written: Prometheus does accept
 * `NaN`, but a `NaN` in a gauge reads on a dashboard as a gap identical to "not collected", and
 * the two mean very different things here.
 */
function sample(lines: string[], name: string, value: number, labelPairs: Record<string, string> = {}): void {
  if (!Number.isFinite(value)) return;
  lines.push(`${name}${labels(labelPairs)} ${value}`);
}

function help(lines: string[], name: string, type: 'gauge' | 'counter' | 'histogram', text: string): void {
  lines.push(`# HELP ${name} ${text}`);
  lines.push(`# TYPE ${name} ${type}`);
}

interface Sample {
  readonly value: number;
  readonly labels?: Record<string, string>;
}

/**
 * Emits a whole metric family, or nothing at all when it has no samples.
 *
 * Two properties fall out of doing it this way rather than writing the header and then looping:
 *
 * - A family with no samples leaves no orphan `# HELP`/`# TYPE` pair behind. Such a pair is legal
 *   and harmless to a parser, but it makes the exposition read as though a metric were being
 *   collected and found empty, when in fact it does not apply — the same absence-versus-zero
 *   confusion this file is careful about everywhere else.
 * - Every sample of a family is necessarily contiguous, which is what strict OpenMetrics parsers
 *   require. It stops being something each call site has to remember.
 */
function family(
  lines: string[],
  name: string,
  type: 'gauge' | 'counter' | 'histogram',
  text: string,
  samples: readonly Sample[],
): void {
  const usable = samples.filter((s) => Number.isFinite(s.value));
  if (usable.length === 0) return;
  help(lines, name, type, text);
  for (const s of usable) sample(lines, name, s.value, s.labels ?? {});
}

/**
 * Folds counts onto a known key set, summing anything unrecognised into `other`.
 *
 * Every known key is emitted even at zero. That is the one place the absence-is-not-zero rule is
 * deliberately inverted, and the reason is that these key sets are closed and always meaningful:
 * "zero failed runs" is a real, useful observation, whereas a missing `failed` series makes a
 * dashboard panel render empty and indistinguishable from a broken scrape.
 */
export function foldOntoKnownKeys(
  rows: readonly MetricsCountByKey[],
  known: readonly string[],
): Map<string, number> {
  const result = new Map<string, number>(known.map((k) => [k, 0]));
  result.set('other', 0);
  for (const row of rows) {
    const key = result.has(row.key) && row.key !== 'other' ? row.key : 'other';
    result.set(key, (result.get(key) ?? 0) + row.count);
  }
  return result;
}

export interface JobDurationHistogram {
  /** Cumulative counts, aligned with `DURATION_BUCKETS_SECONDS`, plus `+Inf` last. */
  readonly cumulative: readonly number[];
  readonly count: number;
  readonly sumSeconds: number;
}

/**
 * Cumulative duration histogram for one job's finished runs.
 *
 * Only runs with a `finishedAt` contribute. A run still in flight has no duration yet, and
 * treating "now minus startedAt" as one would make every scrape report a different value for the
 * same run and inflate the count once it eventually finished and was counted again.
 *
 * A negative duration — `finishedAt` before `startedAt`, which a clock adjustment on a Windows
 * box can genuinely produce — is clamped to zero rather than dropped. Dropping it would quietly
 * lower the run count and make the success rate computed against it wrong.
 */
export function durationHistogram(runs: readonly MetricsJobRunRow[]): JobDurationHistogram {
  const durations: number[] = [];
  for (const run of runs) {
    if (run.finishedAt === null) continue;
    durations.push(Math.max(0, (run.finishedAt - run.startedAt) / 1000));
  }

  // Cumulative by construction — each bucket counts every run at or below its edge, and the
  // final `+Inf` entry counts them all. Built by filtering rather than by incrementing an
  // index, which is both index-safe and the definition of a cumulative histogram written out.
  const cumulative = [
    ...DURATION_BUCKETS_SECONDS.map((edge) => durations.filter((d) => d <= edge).length),
    durations.length,
  ];

  return {
    cumulative,
    count: durations.length,
    sumSeconds: durations.reduce((total, d) => total + d, 0),
  };
}

/** Groups runs by job name, preserving a stable (alphabetical) order for deterministic output. */
export function groupRunsByName(
  runs: readonly MetricsJobRunRow[],
): Map<string, MetricsJobRunRow[]> {
  const byName = new Map<string, MetricsJobRunRow[]>();
  for (const run of runs) {
    const existing = byName.get(run.jobName);
    if (existing) existing.push(run);
    else byName.set(run.jobName, [run]);
  }
  return new Map([...byName.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const PREFIX = 'buybox';

/**
 * Renders the whole exposition.
 *
 * `nowMs` is a parameter rather than a `Date.now()` call so the output is deterministic under
 * test — the same rule the domain core follows for the same reason.
 */
export function renderMetrics(snapshot: MetricsSnapshot, nowMs: number): string {
  const lines: string[] = [];

  // --- process ---------------------------------------------------------------------------
  // `buybox_up` is the first thing every dashboard and every future alert keys off, so it says
  // one narrow thing: this process answered. Whether the database behind it is readable is
  // `buybox_database_up`, deliberately separate — collapsing the two would mean a database
  // outage and a dead service were indistinguishable, and they need different responses.
  help(lines, `${PREFIX}_up`, 'gauge', 'Always 1; the web process answered this scrape.');
  sample(lines, `${PREFIX}_up`, 1);

  help(
    lines,
    `${PREFIX}_build_info`,
    'gauge',
    'Build metadata as labels; the value is always 1.',
  );
  sample(lines, `${PREFIX}_build_info`, 1, { version: snapshot.appVersion ?? 'unknown' });

  help(
    lines,
    `${PREFIX}_process_uptime_seconds`,
    'gauge',
    'Seconds since this process started. A reset means the service restarted.',
  );
  sample(
    lines,
    `${PREFIX}_process_uptime_seconds`,
    Math.max(0, (nowMs - snapshot.processStartedAtMs) / 1000),
  );

  help(
    lines,
    `${PREFIX}_scrape_window_seconds`,
    'gauge',
    'Width of the lookback window the windowed metrics below are computed over.',
  );
  sample(lines, `${PREFIX}_scrape_window_seconds`, snapshot.windowMs / 1000);

  // --- worker ----------------------------------------------------------------------------
  help(
    lines,
    `${PREFIX}_worker_running`,
    'gauge',
    '1 when a worker loop is running in this process, 0 otherwise.',
  );
  sample(lines, `${PREFIX}_worker_running`, snapshot.worker.running ? 1 : 0);

  // Only emitted when the worker is actually running and has reported a tick. On a split
  // deployment the web process hosts no worker at all, and a `0` here would read as "ticking
  // perfectly" — the most dangerous possible misreading of this particular number.
  if (snapshot.worker.msSinceLastTick !== undefined) {
    help(
      lines,
      `${PREFIX}_worker_last_tick_seconds`,
      'gauge',
      'Seconds since the worker loop last ticked. Ticks are ~2s apart; a rising value means the loop has stopped.',
    );
    sample(lines, `${PREFIX}_worker_last_tick_seconds`, snapshot.worker.msSinceLastTick / 1000);
  }

  // --- database --------------------------------------------------------------------------
  const db = snapshot.database;
  help(
    lines,
    `${PREFIX}_database_up`,
    'gauge',
    '1 when the application database answered this scrape, 0 otherwise.',
  );
  sample(lines, `${PREFIX}_database_up`, db ? 1 : 0);

  // Everything below this point is derived from the database. When it could not be read there is
  // nothing truthful to say, so nothing is said — `buybox_database_up 0` above is the whole
  // report, and the panels go blank rather than flat-lining at a reassuring zero.
  if (!db) return `${lines.join('\n')}\n`;

  help(
    lines,
    `${PREFIX}_database_schema_up_to_date`,
    'gauge',
    '1 when the applied migration count matches this build, 0 when the schema has drifted.',
  );
  sample(lines, `${PREFIX}_database_schema_up_to_date`, db.schemaUpToDate ? 1 : 0);

  help(lines, `${PREFIX}_database_info`, 'gauge', 'Database metadata as labels; value always 1.');
  sample(lines, `${PREFIX}_database_info`, 1, { dialect: db.dialect });

  // --- job runs --------------------------------------------------------------------------
  const grouped = groupRunsByName(db.jobRuns);

  const runStateSamples: Sample[] = [];
  const itemSamples: Sample[] = [];
  for (const [jobName, runs] of grouped) {
    const states = foldOntoKnownKeys(
      runs.map((r) => ({ key: r.state, count: 1 })),
      KNOWN_RUN_STATES,
    );
    for (const [state, count] of states) {
      runStateSamples.push({ value: count, labels: { job: jobName, state } });
    }

    let ok = 0;
    let failed = 0;
    for (const r of runs) {
      ok += r.itemsOk;
      failed += r.itemsFailed;
    }
    itemSamples.push({ value: ok, labels: { job: jobName, outcome: 'ok' } });
    itemSamples.push({ value: failed, labels: { job: jobName, outcome: 'failed' } });
  }

  family(
    lines,
    `${PREFIX}_job_runs_total`,
    'gauge',
    'Job runs started within the scrape window, by job name and final state. A gauge, not a counter: it is computed over a moving window rather than accumulated since boot.',
    runStateSamples,
  );
  family(
    lines,
    `${PREFIX}_job_items_total`,
    'gauge',
    'Items processed by runs in the scrape window, by job name and outcome.',
    itemSamples,
  );

  // The three histogram series are separate families in the exposition format even though they
  // are one logical metric, so each is emitted whole. `_bucket` carries the `# TYPE histogram`
  // declaration the others are read against.
  const bucketSamples: Sample[] = [];
  const sumSamples: Sample[] = [];
  const countSamples: Sample[] = [];
  for (const [jobName, runs] of grouped) {
    const histogram = durationHistogram(runs);
    if (histogram.count === 0) continue;
    // `cumulative` is one longer than the bucket list; the entry past the last edge is `+Inf`.
    histogram.cumulative.forEach((value, i) => {
      const edge = DURATION_BUCKETS_SECONDS[i];
      bucketSamples.push({
        value,
        labels: { job: jobName, le: edge === undefined ? '+Inf' : String(edge) },
      });
    });
    sumSamples.push({ value: histogram.sumSeconds, labels: { job: jobName } });
    countSamples.push({ value: histogram.count, labels: { job: jobName } });
  }
  // A histogram is declared once under its **base** name and then carries `_bucket`, `_sum` and
  // `_count` series beneath that one declaration. Declaring `# TYPE ..._bucket histogram`
  // instead would leave Prometheus with three unrelated metrics and no histogram at all, and
  // `histogram_quantile` — the only reason to pay for buckets — would return nothing.
  if (bucketSamples.length > 0) {
    const base = `${PREFIX}_job_run_duration_seconds`;
    help(lines, base, 'histogram', 'Duration of runs that finished within the scrape window, by job name.');
    for (const s of bucketSamples) sample(lines, `${base}_bucket`, s.value, s.labels);
    for (const s of sumSamples) sample(lines, `${base}_sum`, s.value, s.labels);
    for (const s of countSamples) sample(lines, `${base}_count`, s.value, s.labels);
  }

  family(
    lines,
    `${PREFIX}_job_runs_running`,
    'gauge',
    'Runs currently in the running state, by job name. Not window-bounded: a run stuck for hours must stay visible.',
    [...db.runningByName]
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map((row) => ({ value: row.count, labels: { job: row.key } })),
  );

  // --- queue -----------------------------------------------------------------------------
  family(
    lines,
    `${PREFIX}_job_queue_depth`,
    'gauge',
    'Rows in job_queue, by state.',
    [...foldOntoKnownKeys(db.queueByState, KNOWN_QUEUE_STATES)].map(([state, count]) => ({
      value: count,
      labels: { state },
    })),
  );

  // Depth alone cannot separate "busy" from "stalled" — a hundred items due next week and a
  // hundred items an hour overdue are the same number. This is the one that says the scheduler
  // has stopped claiming, which is otherwise invisible until a price goes stale.
  help(
    lines,
    `${PREFIX}_job_queue_oldest_due_seconds`,
    'gauge',
    'Age of the oldest ready item that is already due. Rises without bound when the scheduler stops claiming.',
  );
  sample(
    lines,
    `${PREFIX}_job_queue_oldest_due_seconds`,
    db.oldestReadyRunAfterMs === undefined
      ? 0
      : Math.max(0, (nowMs - db.oldestReadyRunAfterMs) / 1000),
  );

  // --- events ----------------------------------------------------------------------------
  family(
    lines,
    `${PREFIX}_app_events_total`,
    'gauge',
    'app_events rows written within the scrape window, by level.',
    [...foldOntoKnownKeys(db.eventsByLevel, KNOWN_EVENT_LEVELS)].map(([level, count]) => ({
      value: count,
      labels: { level },
    })),
  );

  // Only emitted when there has actually been a warn or error in the window. A `0` for "seconds
  // since the last problem" would mean a problem *right now*, which is the exact opposite of the
  // quiet window it would be reporting.
  if (db.lastProblemEventAtMs !== undefined) {
    help(
      lines,
      `${PREFIX}_app_events_last_problem_seconds`,
      'gauge',
      'Seconds since the most recent warn/error event. Absent when the window contains none.',
    );
    sample(
      lines,
      `${PREFIX}_app_events_last_problem_seconds`,
      Math.max(0, (nowMs - db.lastProblemEventAtMs) / 1000),
    );
  }

  // --- circuit breakers ------------------------------------------------------------------
  // One series per (marketplace, state) with a 0/1 value, rather than one series carrying an
  // integer code. An integer encoding forces every dashboard and every future alert to remember
  // that 2 means half-open, and makes `state == open` unexpressible as a query.
  const breakers = [...db.circuitBreakers].sort((a, b) =>
    a.marketplaceCode < b.marketplaceCode ? -1 : 1,
  );

  family(
    lines,
    `${PREFIX}_circuit_breaker_state`,
    'gauge',
    '1 for the breaker state a marketplace is currently in, 0 for the others.',
    breakers.flatMap((breaker) =>
      KNOWN_BREAKER_STATES.map((state) => ({
        value: breaker.state === state ? 1 : 0,
        labels: { marketplace: breaker.marketplaceCode, state },
      })),
    ),
  );

  family(
    lines,
    `${PREFIX}_circuit_breaker_consecutive_failures`,
    'gauge',
    'Consecutive marketplace call failures recorded against the breaker.',
    breakers.map((breaker) => ({
      value: breaker.consecutiveFailures,
      labels: { marketplace: breaker.marketplaceCode },
    })),
  );

  family(
    lines,
    `${PREFIX}_circuit_breaker_open_seconds`,
    'gauge',
    'Seconds the breaker has been open. Emitted only while a breaker is actually open.',
    breakers
      .filter((breaker) => breaker.openedAt !== null)
      .map((breaker) => ({
        value: Math.max(0, (nowMs - (breaker.openedAt as number)) / 1000),
        labels: { marketplace: breaker.marketplaceCode },
      })),
  );

  // --- update budget ---------------------------------------------------------------------
  // Consumed and allowance are exported as two series rather than a precomputed percentage, so
  // the ratio is a dashboard expression. A percentage alone hides which of the two moved, and
  // "the allowance changed" and "we used more" call for entirely different responses.
  // Each family's samples are emitted together. The text format tolerates interleaving but
  // strict OpenMetrics parsers do not, and a scrape that a stricter agent rejects wholesale is
  // an outage of the monitoring rather than of the thing monitored.
  const budgets = [...db.budgets].sort((a, b) => (a.marketplaceCode < b.marketplaceCode ? -1 : 1));

  family(
    lines,
    `${PREFIX}_update_budget_consumed`,
    'gauge',
    'Marketplace price-update calls consumed today. Not money — a call count.',
    budgets.map((b) => ({ value: b.consumed, labels: { marketplace: b.marketplaceCode } })),
  );
  family(
    lines,
    `${PREFIX}_update_budget_allowance`,
    'gauge',
    'Marketplace price-update calls allowed today.',
    budgets.map((b) => ({ value: b.allowance, labels: { marketplace: b.marketplaceCode } })),
  );

  return `${lines.join('\n')}\n`;
}
