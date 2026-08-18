/**
 * The display boundary is where money stops being `bigint` and where operator text becomes
 * money again. Both directions are table-driven because a rounding or separator mistake here
 * does not throw — it produces a plausible wrong number.
 */
import { describe, expect, it } from 'vitest';
import { formatDuration, parseMoneyToKurus } from './format';

describe('parseMoneyToKurus', () => {
  const accepted: ReadonlyArray<readonly [string, bigint]> = [
    ['400', 40_000n],
    ['400,5', 40_050n],
    ['400,50', 40_050n],
    ['0,01', 1n],
    ['0', 0n],
    ['  1.400,50  ', 140_050n],
    ['1.234.567,89', 123_456_789n],
    ['1400,50', 140_050n],
    // Beyond Number.MAX_SAFE_INTEGER kuruş: the point of parsing into `bigint` by hand.
    ['999999999999999999', 99_999_999_999_999_999_900n],
  ];

  it.each(accepted)('parses %j', (input, expected) => {
    expect(parseMoneyToKurus(input)).toBe(expected);
  });

  const rejected = [
    '',
    '   ',
    'abc',
    '400 TL',
    '-400',
    '400,505',
    // Rejected on purpose rather than read as a thousands group: an operator meaning ₺400,50
    // must not silently get a ₺400.500 threshold that then never fires.
    '400.50',
    '1.40',
    '1.4000',
    '4,0,0',
    '.400',
    '400,',
  ];

  it.each(rejected)('rejects %j', (input) => {
    expect(parseMoneyToKurus(input)).toBeNull();
  });

  it('never goes through a float', () => {
    // 0.1 + 0.2 territory: this exact value is unrepresentable as a double.
    expect(parseMoneyToKurus('8.191,23')).toBe(819_123n);
  });
});

describe('formatDuration', () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [0, '0sn'],
    [999, '0sn'],
    [12_000, '12sn'],
    [59_000, '59sn'],
    [60_000, '1dk 00sn'],
    [184_000, '3dk 04sn'],
    [3_599_000, '59dk 59sn'],
    [3_600_000, '1sa 00dk'],
    [19_200_000, '5sa 20dk'],
    [86_399_000, '23sa 59dk'],
    [86_400_000, '1g 00sa'],
    [194_400_000, '2g 06sa'],
    [7 * 86_400_000, '7g 00sa'],
  ];

  it.each(cases)('formats %i ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('clamps a negative duration rather than rendering a negative unit', () => {
    expect(formatDuration(-5_000)).toBe('0sn');
  });
});
