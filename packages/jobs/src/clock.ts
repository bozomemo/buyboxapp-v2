/**
 * An injectable clock — the domain core forbids `Date.now()` entirely (CLAUDE.md), and this
 * package keeps the same discipline everywhere `now` matters for scheduling or cadence
 * decisions, so the scheduler and every job are testable with a fake clock, no real waiting.
 */
export interface Clock {
  nowMs(): number;
}

export const systemClock: Clock = { nowMs: () => Date.now() };

export class FakeClock implements Clock {
  constructor(private current: number) {}
  nowMs(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
  set(ms: number): void {
    this.current = ms;
  }
}
