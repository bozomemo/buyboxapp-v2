import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  it('starts closed and stays closed on success', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, openDurationMs: 1000 });
    expect(cb.canProceed(0)).toBe(true);
    cb.recordSuccess();
    expect(cb.currentState()).toBe('closed');
  });

  it('opens after the failure threshold and blocks calls until the open duration elapses', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, openDurationMs: 1000 });
    cb.recordFailure(0);
    expect(cb.currentState()).toBe('closed'); // below threshold
    cb.recordFailure(10);
    expect(cb.currentState()).toBe('open');

    expect(cb.canProceed(500)).toBe(false); // still within the open window
    expect(cb.canProceed(1010)).toBe(true); // window elapsed → half-open trial allowed
    expect(cb.currentState()).toBe('half-open');
  });

  it('reopens immediately on a half-open failure, and closes on a half-open success', () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, openDurationMs: 1000 });
    cb.recordFailure(0);
    expect(cb.currentState()).toBe('open');
    cb.canProceed(1000); // transitions to half-open
    expect(cb.currentState()).toBe('half-open');

    cb.recordFailure(1000);
    expect(cb.currentState()).toBe('open');

    cb.canProceed(2000);
    cb.recordSuccess();
    expect(cb.currentState()).toBe('closed');
  });
});
