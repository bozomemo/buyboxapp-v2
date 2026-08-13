/**
 * A circuit breaker guarding a single upstream (one instance per marketplace/API domain).
 * Pure state machine driven by an explicit `nowMs`, like `RateLimiter` — unit-testable with a
 * fake clock, no real timers.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Consecutive failures (while closed) before the circuit opens. */
  readonly failureThreshold: number;
  /** How long the circuit stays open before allowing one half-open trial. */
  readonly openDurationMs: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAtMs = 0;

  constructor(private readonly config: CircuitBreakerConfig) {}

  /** Call before attempting the upstream request. */
  canProceed(nowMs: number): boolean {
    if (this.state === 'open') {
      if (nowMs - this.openedAtMs >= this.config.openDurationMs) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    return true; // closed or half-open (one trial in flight)
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  recordFailure(nowMs: number): void {
    this.consecutiveFailures += 1;
    if (this.state === 'half-open' || this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = 'open';
      this.openedAtMs = nowMs;
    }
  }

  currentState(): CircuitState {
    return this.state;
  }
}
