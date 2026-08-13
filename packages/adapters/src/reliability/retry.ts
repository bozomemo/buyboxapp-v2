/**
 * Retry with exponential backoff. The delay computation is pure (unit-testable with a fake
 * clock via plain arithmetic); the async driver takes an injectable `sleep` so tests never wait
 * on real timers.
 */

export interface BackoffConfig {
  readonly maxAttempts: number; // total attempts, including the first
  readonly baseMs: number;
  readonly factor: number;
  readonly maxDelayMs: number;
}

/** Delay before attempt number `attempt` (1-based: the delay before the *retry*, i.e. attempt ≥ 2). */
export function computeBackoffMs(attempt: number, config: BackoffConfig): number {
  if (attempt <= 1) return 0;
  const raw = config.baseMs * config.factor ** (attempt - 2);
  return Math.min(config.maxDelayMs, raw);
}

export interface RetryOptions extends BackoffConfig {
  readonly isRetryable: (error: unknown) => boolean;
  /** Injectable so tests resolve instantly instead of waiting on real time. */
  readonly sleep: (ms: number) => Promise<void>;
}

export async function retryAsync<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= options.maxAttempts || !options.isRetryable(error)) {
        throw error;
      }
      await options.sleep(computeBackoffMs(attempt + 1, options));
    }
  }
  throw lastError;
}

export const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
