import { JOB_MODULES } from '@buybox/jobs';
import { describe, expect, it } from 'vitest';
import { JOB_LABELS } from './labels';

describe('JOB_LABELS', () => {
  // The run history printed `SweepTrackedProducts` and `ResolveSellerIdentity` raw (found
  // 2026-09-19): `labelOf` falls back to the key, so a missing label fails silently. `JOB_MODULES`
  // is the worker's own list of every registered job (its test enforces that), so it is the list
  // to check against.
  it('names every job the worker runs', () => {
    const jobNames = Object.keys(JOB_MODULES);
    expect(jobNames.filter((name) => !(name in JOB_LABELS))).toEqual([]);
  });
});
