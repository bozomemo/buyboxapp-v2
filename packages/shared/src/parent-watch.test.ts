import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isProcessAlive, watchParentProcess } from './parent-watch.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('watchParentProcess', () => {
  it('reports the parent once, the first time it is found gone', () => {
    let alive = true;
    const onOrphaned = vi.fn();
    watchParentProcess({ parentPid: 4242, intervalMs: 1000, isAlive: () => alive, onOrphaned });

    vi.advanceTimersByTime(3000);
    expect(onOrphaned).not.toHaveBeenCalled();

    alive = false;
    vi.advanceTimersByTime(1000);
    expect(onOrphaned).toHaveBeenCalledExactlyOnceWith(4242);

    // Stops looking after reporting — a second call would start a second shutdown.
    vi.advanceTimersByTime(5000);
    expect(onOrphaned).toHaveBeenCalledOnce();
  });

  it('stops when the returned function is called', () => {
    const onOrphaned = vi.fn();
    const stop = watchParentProcess({ parentPid: 4242, intervalMs: 1000, isAlive: () => false, onOrphaned });
    stop();
    vi.advanceTimersByTime(5000);
    expect(onOrphaned).not.toHaveBeenCalled();
  });

  it.each([0, 1])('does not watch parent pid %i, which can never orphan the process', (parentPid) => {
    const isAlive = vi.fn(() => false);
    const onOrphaned = vi.fn();
    watchParentProcess({ parentPid, intervalMs: 1000, isAlive, onOrphaned });
    vi.advanceTimersByTime(5000);
    expect(isAlive).not.toHaveBeenCalled();
    expect(onOrphaned).not.toHaveBeenCalled();
  });
});

describe('isProcessAlive', () => {
  it('sees this process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('does not see a pid that does not exist', () => {
    // Above every default pid_max (Linux 4,194,304) and far above any Windows pid in practice.
    expect(isProcessAlive(2_147_483_000)).toBe(false);
  });
});
