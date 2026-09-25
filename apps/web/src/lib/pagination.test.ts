import { describe, expect, it } from 'vitest';
import { pageLimit, pageOffset } from './pagination';

describe('pageLimit', () => {
  const cases: { raw: string | null; expected: number }[] = [
    { raw: null, expected: 50 },
    { raw: '', expected: 50 },
    { raw: '20', expected: 20 },
    { raw: '20.9', expected: 20 },
    { raw: '100000', expected: 200 },
    // `LIMIT -1` is no limit at all to SQLite — the case this exists for.
    { raw: '-1', expected: 50 },
    { raw: '0', expected: 50 },
    { raw: 'abc', expected: 50 },
  ];
  for (const { raw, expected } of cases) {
    it(`${JSON.stringify(raw)} → ${expected}`, () => {
      expect(pageLimit(raw, 50, 200)).toBe(expected);
    });
  }
});

describe('pageOffset', () => {
  it.each([
    [null, 0],
    ['-5', 0],
    ['abc', 0],
    ['40', 40],
  ] as const)('%s → %s', (raw, expected) => {
    expect(pageOffset(raw)).toBe(expected);
  });
});
