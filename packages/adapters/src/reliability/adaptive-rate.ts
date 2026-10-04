/**
 * An adaptive request rate for a reporting-only source: back off when the marketplace says
 * "too many requests", creep back up while it stays quiet (doc 07 §7.7, operator request
 * 2026-10-04).
 *
 * The shape is TCP's congestion control (AIMD — additive increase, multiplicative decrease):
 * halve the rate on a throttle, add one request a minute after every quiet interval. It never
 * goes above the operator's configured rate — that figure stops being "the rate" and becomes
 * "the most the source may ask for" — and never below a floor, so a throttled source slows down
 * rather than stops.
 *
 * Why it exists: on 2026-10-03/04 the production install's Trendyol sweep ran at its full
 * configured 30/min around the clock and collected 3,040 `429`s in a day, in daytime blocks of
 * five to fourteen hours. The fixed rate could not respond, and the sweep's consecutive-failure
 * halt made it worse rather than better: the halted run was replaced a minute later by one at
 * the same rate, so the throttled IP met a fresh burst every three minutes. This controller
 * lives as long as the source does (one per worker process), so a slowed rate survives the
 * halt-and-restart between job runs — which is the property the fixed limiter lacked.
 *
 * Deliberately pure, like `RateLimiter`: every call takes `nowMs` and nothing reads a clock or
 * sleeps, so every branch is unit-testable with plain numbers.
 */

export interface AdaptiveRateConfig {
  /** The operator's configured requests per minute — the ceiling, and the starting rate. */
  readonly ceilingPerMinute: number;
  /** Lowest rate a throttle may push the source to. Clamped to the ceiling. */
  readonly floorPerMinute: number;
  /** Multiplier applied on a throttle, in (0, 1). */
  readonly decreaseFactor: number;
  /**
   * A second throttle within this window pauses again but does not halve again. The source
   * reads several pages at once, so one throttling episode arrives as several `429`s within
   * seconds; counting each would take 30/min to the floor on what is a single signal.
   */
  readonly decreaseCooldownMs: number;
  /** Requests per minute added after each quiet interval. */
  readonly increaseStepPerMinute: number;
  /** How long without a throttle before the next step up. */
  readonly increaseIntervalMs: number;
  /** Pause after a throttle that carried no usable `Retry-After`. */
  readonly defaultPauseMs: number;
  /** Upper bound on any pause, including one a `Retry-After` asked for. */
  readonly maxPauseMs: number;
}

export const ADAPTIVE_RATE_DEFAULTS = {
  floorPerMinute: 3,
  decreaseFactor: 0.5,
  decreaseCooldownMs: 60_000,
  increaseStepPerMinute: 1,
  increaseIntervalMs: 3 * 60_000,
  defaultPauseMs: 60_000,
  maxPauseMs: 10 * 60_000,
} as const;

export interface AdaptiveRateChange {
  readonly direction: 'decrease' | 'increase';
  readonly fromPerMinute: number;
  readonly toPerMinute: number;
  readonly ceilingPerMinute: number;
  /** For a decrease: how long every request is held back. 0 for an increase. */
  readonly pauseMs: number;
}

export class AdaptiveRateController {
  private readonly config: AdaptiveRateConfig;
  private readonly floor: number;
  private current: number;
  private pausedUntilMs = 0;
  private lastDecreaseAtMs = Number.NEGATIVE_INFINITY;
  /** Start of the current quiet interval: the last throttle or the last step up. */
  private quietSinceMs: number | undefined;

  constructor(config: AdaptiveRateConfig) {
    if (!(config.ceilingPerMinute > 0)) {
      throw new RangeError('AdaptiveRateController: ceilingPerMinute must be positive');
    }
    if (!(config.decreaseFactor > 0 && config.decreaseFactor < 1)) {
      throw new RangeError('AdaptiveRateController: decreaseFactor must be in (0, 1)');
    }
    this.config = config;
    this.floor = Math.max(1, Math.min(config.floorPerMinute, config.ceilingPerMinute));
    this.current = config.ceilingPerMinute;
  }

  get ratePerMinute(): number {
    return this.current;
  }

  get ceilingPerMinute(): number {
    return this.config.ceilingPerMinute;
  }

  /** Whether the source is running below its ceiling — i.e. recovering from a throttle. */
  get isReduced(): boolean {
    return this.current < this.config.ceilingPerMinute;
  }

  /**
   * When the latest throttle pause ends (epoch ms; 0 before any throttle). Lets a waiter tell a
   * pause it has already sat out from one armed while it was waiting.
   */
  get pausedUntil(): number {
    return this.pausedUntilMs;
  }

  /** How long a request made at `nowMs` must still wait out a throttle pause; 0 when none. */
  pauseRemainingMs(nowMs: number): number {
    return Math.max(0, this.pausedUntilMs - nowMs);
  }

  /**
   * The marketplace throttled a request. Always (re)arms the pause; halves the rate unless it
   * was already halved within the cooldown. Returns the change when the rate moved.
   */
  onThrottled(nowMs: number, retryAfterMs?: number): AdaptiveRateChange | undefined {
    const requested =
      retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : this.config.defaultPauseMs;
    const pauseMs = Math.min(this.config.maxPauseMs, requested);
    this.pausedUntilMs = Math.max(this.pausedUntilMs, nowMs + pauseMs);
    // The quiet interval restarts at every throttle, including one inside the cooldown.
    this.quietSinceMs = nowMs;

    if (nowMs - this.lastDecreaseAtMs < this.config.decreaseCooldownMs) return undefined;
    this.lastDecreaseAtMs = nowMs;
    const from = this.current;
    const to = Math.max(this.floor, Math.ceil(from * this.config.decreaseFactor));
    if (to === from) return undefined;
    this.current = to;
    return {
      direction: 'decrease',
      fromPerMinute: from,
      toPerMinute: to,
      ceilingPerMinute: this.config.ceilingPerMinute,
      pauseMs,
    };
  }

  /**
   * A request was answered without a throttle. Steps the rate up by one increment when a full
   * quiet interval has passed since the last throttle or step. Returns the change when it moved.
   */
  onAnswered(nowMs: number): AdaptiveRateChange | undefined {
    if (!this.isReduced || this.quietSinceMs === undefined) return undefined;
    if (nowMs - this.quietSinceMs < this.config.increaseIntervalMs) return undefined;
    const from = this.current;
    const to = Math.min(this.config.ceilingPerMinute, from + this.config.increaseStepPerMinute);
    this.current = to;
    this.quietSinceMs = nowMs;
    return {
      direction: 'increase',
      fromPerMinute: from,
      toPerMinute: to,
      ceilingPerMinute: this.config.ceilingPerMinute,
      pauseMs: 0,
    };
  }
}

/**
 * Parses an HTTP `Retry-After` header (RFC 9110 §10.2.3): either delta-seconds or an HTTP date.
 * Returns undefined for an absent or unreadable value — the caller then uses its default pause.
 */
export function parseRetryAfterMs(value: string | null | undefined, nowMs: number): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  // A signed or fractional number is neither form; `Date.parse` would read "-5" as a year.
  if (/^[-+]?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - nowMs);
}
