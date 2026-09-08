/**
 * Table-driven tests for the metrics exposition (doc 16 §3).
 *
 * These test the arithmetic and the *shape* of the output, not the database. That split is the
 * whole design: `packages/db/src/repositories/metrics.ts` reads rows, this file turns rows into
 * text, and only the latter can be quietly wrong in a way nobody notices until a dashboard has
 * been believed for a month.
 */
import { describe, expect, it } from 'vitest';
import {
  DURATION_BUCKETS_SECONDS,
  durationHistogram,
  escapeLabelValue,
  foldOntoKnownKeys,
  groupRunsByName,
  renderMetrics,
  type MetricsJobRunRow,
  type MetricsSnapshot,
} from './metrics';

const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

function run(overrides: Partial<MetricsJobRunRow> = {}): MetricsJobRunRow {
  return {
    jobName: 'RepriceListings',
    startedAt: NOW - 60_000,
    finishedAt: NOW - 30_000,
    state: 'succeeded',
    itemsOk: 10,
    itemsFailed: 0,
    itemsTotal: 10,
    ...overrides,
  };
}

function snapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    windowMs: 3_600_000,
    appVersion: '1.4.2',
    processStartedAtMs: NOW - 7_200_000,
    worker: { running: true, msSinceLastTick: 1_500 },
    database: {
      dialect: 'sqlite',
      schemaUpToDate: true,
      jobRuns: [],
      runningByName: [],
      queueByState: [],
      oldestReadyRunAfterMs: undefined,
      eventsByLevel: [],
      lastProblemEventAtMs: undefined,
      circuitBreakers: [],
      budgets: [],
    },
    ...overrides,
  };
}

/** Parses the exposition back into `name{labels} value` entries so assertions read by meaning. */
function parse(text: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const lastSpace = line.lastIndexOf(' ');
    result.set(line.slice(0, lastSpace), Number(line.slice(lastSpace + 1)));
  }
  return result;
}

describe('escapeLabelValue', () => {
  it.each([
    ['plain', 'plain'],
    ['with"quote', 'with\\"quote'],
    ['with\\backslash', 'with\\\\backslash'],
    ['with\nnewline', 'with\\nnewline'],
    ['all\\"\n', 'all\\\\\\"\\n'],
  ])('escapes %j', (input, expected) => {
    expect(escapeLabelValue(input)).toBe(expected);
  });
});

describe('foldOntoKnownKeys', () => {
  it('emits every known key at zero when nothing was counted', () => {
    const folded = foldOntoKnownKeys([], ['a', 'b']);
    expect([...folded.entries()]).toEqual([
      ['a', 0],
      ['b', 0],
      ['other', 0],
    ]);
  });

  it('sums unrecognised keys into other rather than dropping them', () => {
    const folded = foldOntoKnownKeys(
      [
        { key: 'a', count: 3 },
        { key: 'surprise', count: 2 },
        { key: 'another', count: 5 },
      ],
      ['a', 'b'],
    );
    expect(folded.get('a')).toBe(3);
    expect(folded.get('b')).toBe(0);
    expect(folded.get('other')).toBe(7);
  });

  it('does not double-count a key literally named other', () => {
    const folded = foldOntoKnownKeys([{ key: 'other', count: 4 }], ['a']);
    expect(folded.get('other')).toBe(4);
  });
});

describe('durationHistogram', () => {
  it('ignores runs still in flight', () => {
    const histogram = durationHistogram([run({ finishedAt: null }), run({ finishedAt: null })]);
    expect(histogram.count).toBe(0);
    expect(histogram.sumSeconds).toBe(0);
    expect(histogram.cumulative.every((n) => n === 0)).toBe(true);
  });

  it('is cumulative — a 3s run counts in every bucket from 5s upward', () => {
    const histogram = durationHistogram([run({ startedAt: 0, finishedAt: 3_000 })]);
    const expected = DURATION_BUCKETS_SECONDS.map((edge) => (3 <= edge ? 1 : 0));
    expect(histogram.cumulative).toEqual([...expected, 1]);
    expect(histogram.count).toBe(1);
    expect(histogram.sumSeconds).toBe(3);
  });

  it('puts a run longer than the largest bucket in +Inf only', () => {
    const histogram = durationHistogram([run({ startedAt: 0, finishedAt: 7_200_000 })]);
    expect(histogram.cumulative.slice(0, -1).every((n) => n === 0)).toBe(true);
    expect(histogram.cumulative[histogram.cumulative.length - 1]).toBe(1);
    expect(histogram.sumSeconds).toBe(7200);
  });

  it('clamps a negative duration to zero rather than dropping the run', () => {
    // A clock adjustment on the host can genuinely produce this. Dropping it would silently
    // lower the run count that success rate is computed against.
    const histogram = durationHistogram([run({ startedAt: 5_000, finishedAt: 1_000 })]);
    expect(histogram.count).toBe(1);
    expect(histogram.sumSeconds).toBe(0);
    expect(histogram.cumulative[0]).toBe(1);
  });

  it('accumulates across several runs', () => {
    const histogram = durationHistogram([
      run({ startedAt: 0, finishedAt: 500 }),
      run({ startedAt: 0, finishedAt: 10_000 }),
      run({ startedAt: 0, finishedAt: 100_000 }),
    ]);
    expect(histogram.count).toBe(3);
    expect(histogram.sumSeconds).toBe(110.5);
    // 0.5s bucket holds only the first run.
    expect(histogram.cumulative[0]).toBe(1);
    // +Inf holds all three.
    expect(histogram.cumulative[histogram.cumulative.length - 1]).toBe(3);
  });
});

describe('groupRunsByName', () => {
  it('groups and orders names deterministically', () => {
    const grouped = groupRunsByName([
      run({ jobName: 'Zeta' }),
      run({ jobName: 'Alpha' }),
      run({ jobName: 'Zeta' }),
    ]);
    expect([...grouped.keys()]).toEqual(['Alpha', 'Zeta']);
    expect(grouped.get('Zeta')).toHaveLength(2);
  });
});

describe('renderMetrics', () => {
  it('always reports the process as up', () => {
    const parsed = parse(renderMetrics(snapshot(), NOW));
    expect(parsed.get('buybox_up')).toBe(1);
  });

  it('separates a dead database from a dead process, and emits no job metrics without one', () => {
    const text = renderMetrics(snapshot({ database: undefined }), NOW);
    const parsed = parse(text);
    expect(parsed.get('buybox_up')).toBe(1);
    expect(parsed.get('buybox_database_up')).toBe(0);
    // The absence-is-not-zero rule: a flat zero here is indistinguishable from a quiet night.
    expect(text).not.toContain('buybox_job_runs_total');
    expect(text).not.toContain('buybox_job_queue_depth');
  });

  it('reports uptime and window in seconds', () => {
    const parsed = parse(renderMetrics(snapshot(), NOW));
    expect(parsed.get('buybox_process_uptime_seconds')).toBe(7200);
    expect(parsed.get('buybox_scrape_window_seconds')).toBe(3600);
  });

  it('omits the worker tick gauge entirely when no worker runs here', () => {
    // On a split deployment the web process hosts no worker; a 0 would read as "ticking
    // perfectly", the most dangerous misreading available.
    const text = renderMetrics(
      snapshot({ worker: { running: false, msSinceLastTick: undefined } }),
      NOW,
    );
    expect(parse(text).get('buybox_worker_running')).toBe(0);
    expect(text).not.toContain('buybox_worker_last_tick_seconds');
  });

  it('counts runs per job and state, emitting known states at zero', () => {
    const parsed = parse(
      renderMetrics(
        snapshot({
          database: {
            ...snapshot().database!,
            jobRuns: [
              run({ jobName: 'A', state: 'succeeded' }),
              run({ jobName: 'A', state: 'failed' }),
              run({ jobName: 'A', state: 'failed' }),
              run({ jobName: 'B', state: 'succeeded' }),
            ],
          },
        }),
        NOW,
      ),
    );
    expect(parsed.get('buybox_job_runs_total{job="A",state="succeeded"}')).toBe(1);
    expect(parsed.get('buybox_job_runs_total{job="A",state="failed"}')).toBe(2);
    expect(parsed.get('buybox_job_runs_total{job="A",state="cancelled"}')).toBe(0);
    expect(parsed.get('buybox_job_runs_total{job="B",state="failed"}')).toBe(0);
  });

  it('folds an unknown run state into other rather than dropping it', () => {
    const parsed = parse(
      renderMetrics(
        snapshot({
          database: { ...snapshot().database!, jobRuns: [run({ jobName: 'A', state: 'wedged' })] },
        }),
        NOW,
      ),
    );
    expect(parsed.get('buybox_job_runs_total{job="A",state="other"}')).toBe(1);
  });

  it('sums items by outcome', () => {
    const parsed = parse(
      renderMetrics(
        snapshot({
          database: {
            ...snapshot().database!,
            jobRuns: [
              run({ jobName: 'A', itemsOk: 5, itemsFailed: 1 }),
              run({ jobName: 'A', itemsOk: 3, itemsFailed: 2 }),
            ],
          },
        }),
        NOW,
      ),
    );
    expect(parsed.get('buybox_job_items_total{job="A",outcome="ok"}')).toBe(8);
    expect(parsed.get('buybox_job_items_total{job="A",outcome="failed"}')).toBe(3);
  });

  it('emits a well-formed histogram with a +Inf bucket matching the count', () => {
    const text = renderMetrics(
      snapshot({
        database: {
          ...snapshot().database!,
          jobRuns: [
            run({ jobName: 'A', startedAt: 0, finishedAt: 2_000 }),
            run({ jobName: 'A', startedAt: 0, finishedAt: 20_000 }),
          ],
        },
      }),
      NOW,
    );
    const parsed = parse(text);
    expect(parsed.get('buybox_job_run_duration_seconds_count{job="A"}')).toBe(2);
    expect(parsed.get('buybox_job_run_duration_seconds_sum{job="A"}')).toBe(22);
    expect(parsed.get('buybox_job_run_duration_seconds_bucket{job="A",le="+Inf"}')).toBe(2);
    expect(parsed.get('buybox_job_run_duration_seconds_bucket{job="A",le="5"}')).toBe(1);
    expect(text).toContain('# TYPE buybox_job_run_duration_seconds histogram');
  });

  it('omits a histogram for a job whose runs have not finished', () => {
    const text = renderMetrics(
      snapshot({
        database: {
          ...snapshot().database!,
          jobRuns: [run({ jobName: 'A', finishedAt: null })],
        },
      }),
      NOW,
    );
    expect(text).not.toContain('buybox_job_run_duration_seconds_bucket{job="A"');
    // The run itself is still counted — it exists, it just has no duration yet.
    expect(parse(text).get('buybox_job_runs_total{job="A",state="succeeded"}')).toBe(1);
  });

  it('measures queue staleness from the oldest due item, and reports 0 when nothing is due', () => {
    const stale = parse(
      renderMetrics(
        snapshot({
          database: { ...snapshot().database!, oldestReadyRunAfterMs: NOW - 90_000 },
        }),
        NOW,
      ),
    );
    expect(stale.get('buybox_job_queue_oldest_due_seconds')).toBe(90);

    const idle = parse(renderMetrics(snapshot(), NOW));
    expect(idle.get('buybox_job_queue_oldest_due_seconds')).toBe(0);
  });

  it('omits the last-problem gauge when the window is clean', () => {
    // A 0 would mean "a problem right now" — the opposite of the quiet window it reports on.
    const text = renderMetrics(snapshot(), NOW);
    expect(text).not.toContain('buybox_app_events_last_problem_seconds');

    const withProblem = renderMetrics(
      snapshot({ database: { ...snapshot().database!, lastProblemEventAtMs: NOW - 45_000 } }),
      NOW,
    );
    expect(parse(withProblem).get('buybox_app_events_last_problem_seconds')).toBe(45);
  });

  it('encodes breaker state as one 0/1 series per state, not an integer code', () => {
    const parsed = parse(
      renderMetrics(
        snapshot({
          database: {
            ...snapshot().database!,
            circuitBreakers: [
              {
                marketplaceCode: 'TY',
                state: 'open',
                consecutiveFailures: 5,
                openedAt: NOW - 120_000,
                updatedAt: NOW,
              },
            ],
          },
        }),
        NOW,
      ),
    );
    expect(parsed.get('buybox_circuit_breaker_state{marketplace="TY",state="open"}')).toBe(1);
    expect(parsed.get('buybox_circuit_breaker_state{marketplace="TY",state="closed"}')).toBe(0);
    expect(parsed.get('buybox_circuit_breaker_state{marketplace="TY",state="half-open"}')).toBe(0);
    expect(parsed.get('buybox_circuit_breaker_consecutive_failures{marketplace="TY"}')).toBe(5);
    expect(parsed.get('buybox_circuit_breaker_open_seconds{marketplace="TY"}')).toBe(120);
  });

  it('omits open_seconds for a breaker that is not open', () => {
    const text = renderMetrics(
      snapshot({
        database: {
          ...snapshot().database!,
          circuitBreakers: [
            {
              marketplaceCode: 'HB',
              state: 'closed',
              consecutiveFailures: 0,
              openedAt: null,
              updatedAt: NOW,
            },
          ],
        },
      }),
      NOW,
    );
    expect(text).not.toContain('buybox_circuit_breaker_open_seconds');
  });

  it('exports budget consumed and allowance separately, not a precomputed ratio', () => {
    const text = renderMetrics(
      snapshot({
        database: {
          ...snapshot().database!,
          budgets: [
            { marketplaceCode: 'TY', usageDate: '2026-09-08', consumed: 120, allowance: 500 },
          ],
        },
      }),
      NOW,
    );
    const parsed = parse(text);
    expect(parsed.get('buybox_update_budget_consumed{marketplace="TY"}')).toBe(120);
    expect(parsed.get('buybox_update_budget_allowance{marketplace="TY"}')).toBe(500);
    expect(text).not.toContain('budget_ratio');
  });

  it('groups each metric family together so a strict parser accepts the payload', () => {
    const text = renderMetrics(
      snapshot({
        database: {
          ...snapshot().database!,
          budgets: [
            { marketplaceCode: 'TY', usageDate: '2026-09-08', consumed: 1, allowance: 2 },
            { marketplaceCode: 'HB', usageDate: '2026-09-08', consumed: 3, allowance: 4 },
          ],
        },
      }),
      NOW,
    );
    const familyOf = (line: string): string => line.split(/[{ ]/)[0] ?? '';
    const seen = new Set<string>();
    let previous = '';
    for (const line of text.split('\n')) {
      if (line === '' || line.startsWith('#')) continue;
      const family = familyOf(line);
      if (family !== previous) {
        // Re-entering a family already finished is exactly the interleaving strict parsers reject.
        expect(seen.has(family)).toBe(false);
        seen.add(family);
        previous = family;
      }
    }
  });

  it('ends with a newline and contains no NaN samples', () => {
    const text = renderMetrics(
      snapshot({ worker: { running: true, msSinceLastTick: Number.NaN } }),
      NOW,
    );
    expect(text.endsWith('\n')).toBe(true);
    expect(text).not.toContain('NaN');
  });

  it('escapes a job name that would otherwise break the line format', () => {
    const parsed = parse(
      renderMetrics(
        snapshot({
          database: { ...snapshot().database!, jobRuns: [run({ jobName: 'Odd"Name' })] },
        }),
        NOW,
      ),
    );
    expect(parsed.get('buybox_job_runs_total{job="Odd\\"Name",state="succeeded"}')).toBe(1);
  });
});
