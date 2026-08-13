import { describe, expect, it } from 'vitest';
import { computeObservationTier, type TieringInput } from './observe-buybox.js';

const base: TieringInput = { phase: 'OPTIMUM', locked: false, offeredStock: 10, recentlyLostBuybox: false };

describe('computeObservationTier (doc 07 §4)', () => {
  it.each([
    [
      'locked listings are Frozen regardless of phase',
      { ...base, locked: true, phase: 'SEEKING' as const },
      'frozen',
    ],
    ['out-of-stock listings are Frozen regardless of phase', { ...base, offeredStock: 0 }, 'frozen'],
    ['SEEKING is Hot', { ...base, phase: 'SEEKING' as const }, 'hot'],
    ['CLIMBING is Hot', { ...base, phase: 'CLIMBING' as const }, 'hot'],
    ['REFINING is Hot', { ...base, phase: 'REFINING' as const }, 'hot'],
    ['no state yet (never repriced) is Hot', { ...base, phase: null }, 'hot'],
    ['OPTIMUM that just lost the buybox is Hot', { ...base, recentlyLostBuybox: true }, 'hot'],
    ['BLOCKED is Cold', { ...base, phase: 'BLOCKED' as const }, 'cold'],
    ['converged OPTIMUM is Warm', { ...base, phase: 'OPTIMUM' as const }, 'warm'],
  ] as const)('%s', (_label, input, expected) => {
    expect(computeObservationTier(input)).toBe(expected);
  });

  it('tier assignment is a deterministic pure function of its inputs (doc 12 Phase 5.4 DoD)', () => {
    const input: TieringInput = {
      phase: 'OPTIMUM',
      locked: false,
      offeredStock: 5,
      recentlyLostBuybox: false,
    };
    const results = new Set(Array.from({ length: 20 }, () => computeObservationTier(input)));
    expect(results.size).toBe(1);
  });
});
