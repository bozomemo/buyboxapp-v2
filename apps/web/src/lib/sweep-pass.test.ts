import { describe, expect, it } from 'vitest';
import { estimateFinishAtMs, MIN_SAMPLE_FOR_ESTIMATE } from './sweep-pass';

const START = 1_700_000_000_000;
const MINUTE = 60_000;

describe('estimateFinishAtMs', () => {
  it('extrapolates the pass\'s own measured rate', () => {
    // 100 products in 10 minutes → 6 s each; 4,579 left is another 457.9 minutes.
    const now = START + 10 * MINUTE;
    const estimate = estimateFinishAtMs(
      { startedAt: START, finishedAt: null, plannedCount: 4_679, doneCount: 100 },
      now,
    );
    expect(estimate).toBe(now + 457.9 * MINUTE);
  });

  it('says nothing until the pass has read enough to have a rate', () => {
    const now = START + MINUTE;
    expect(
      estimateFinishAtMs(
        { startedAt: START, finishedAt: null, plannedCount: 4_679, doneCount: MIN_SAMPLE_FOR_ESTIMATE },
        now,
      ),
    ).toBeNull();
  });

  it('says nothing about a pass that has already finished', () => {
    expect(
      estimateFinishAtMs(
        { startedAt: START, finishedAt: START + MINUTE, plannedCount: 100, doneCount: 100 },
        START + 2 * MINUTE,
      ),
    ).toBeNull();
  });

  /** A pass whose plan was overtaken by products added mid-pass is finishing, not overdue. */
  it('never predicts a time in the past when done overtakes the plan', () => {
    const now = START + 10 * MINUTE;
    expect(
      estimateFinishAtMs({ startedAt: START, finishedAt: null, plannedCount: 100, doneCount: 105 }, now),
    ).toBe(now);
  });
});
