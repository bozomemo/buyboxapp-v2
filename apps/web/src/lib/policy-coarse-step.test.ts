import { describe, expect, it } from 'vitest';
import { parseCoarseStep } from './policy-coarse-step';

/**
 * The coarse climb step (doc 03 §3): `step = mode == 'percent' ? price × pct/100 : amount`. Until
 * 2026-11-18 every save route stored the fixed amount as a hard-coded 0, so "Sabit tutar" made
 * the climb add nothing and a price never rose. These rows pin the parse that replaced it.
 */
describe('parseCoarseStep', () => {
  const accepted: readonly [string, { mode: 'absolute' | 'percent'; percent?: string; absolute?: string }, { absolute: bigint | null; percent: number | null }][] = [
    ['a fixed amount with a dot', { mode: 'absolute', absolute: '2.50' }, { absolute: 250n, percent: null }],
    ['a fixed amount with a comma', { mode: 'absolute', absolute: '2,50' }, { absolute: 250n, percent: null }],
    ['a whole fixed amount', { mode: 'absolute', absolute: '1' }, { absolute: 100n, percent: null }],
    ['one kuruş', { mode: 'absolute', absolute: '0.01' }, { absolute: 1n, percent: null }],
    ['an amount padded with spaces', { mode: 'absolute', absolute: ' 3.00 ' }, { absolute: 300n, percent: null }],
    ['a percentage', { mode: 'percent', percent: '5' }, { absolute: null, percent: 5 }],
    ['a fractional percentage', { mode: 'percent', percent: '1.5' }, { absolute: null, percent: 1.5 }],
    ['a percentage ignoring a stale amount', { mode: 'percent', percent: '5', absolute: 'kırk' }, { absolute: null, percent: 5 }],
    ['an amount ignoring a stale percentage', { mode: 'absolute', absolute: '1.00', percent: '' }, { absolute: 100n, percent: null }],
  ];
  it.each(accepted)('accepts %s', (_name, input, expected) => {
    expect(parseCoarseStep(input.mode, input.percent, input.absolute)).toEqual({ ok: true, ...expected });
  });

  const refused: readonly [string, { mode: string; percent?: string; absolute?: string }][] = [
    ['a fixed amount of zero', { mode: 'absolute', absolute: '0' }],
    ['a fixed amount of 0.00', { mode: 'absolute', absolute: '0.00' }],
    ['an empty fixed amount', { mode: 'absolute', absolute: '' }],
    ['a missing fixed amount', { mode: 'absolute' }],
    ['a negative fixed amount', { mode: 'absolute', absolute: '-1.00' }],
    ['a fixed amount that is not money', { mode: 'absolute', absolute: 'kırk' }],
    ['a fixed amount finer than a kuruş', { mode: 'absolute', absolute: '1.005' }],
    ['a thousands-grouped amount read ambiguously', { mode: 'absolute', absolute: '1.400' }],
    ['a percentage of zero', { mode: 'percent', percent: '0' }],
    ['an empty percentage', { mode: 'percent', percent: '' }],
    ['a percentage that is not a number', { mode: 'percent', percent: 'beş' }],
    ['an unknown mode', { mode: 'step', percent: '5' }],
  ];
  it.each(refused)('refuses %s', (_name, input) => {
    const result = parseCoarseStep(input.mode, input.percent, input.absolute);
    expect(result.ok).toBe(false);
  });
});
