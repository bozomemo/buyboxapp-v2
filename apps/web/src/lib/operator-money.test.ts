import { describe, expect, it } from 'vitest';
import { isOperatorDecimal, parseNonNegativeNumber, parsePositiveRatio, toWireDecimal } from './operator-money';

describe('toWireDecimal', () => {
  it.each([
    ['120.50', '120.50'],
    ['120,50', '120.50'],
    ['120,5', '120.5'],
    ['120', '120'],
    [' 39,99 ', '39.99'],
    ['1.234,56', '1234.56'],
    ['12.345.678,9', '12345678.9'],
    ['1234,56', '1234.56'],
    ['0', '0'],
    ['-2,50', '-2.50'],
    ['-2.50', '-2.50'],
  ])('%s → %s', (input, wire) => {
    expect(toWireDecimal(input)).toBe(wire);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['1.400'], // thousands or decimal? refused rather than guessed
    ['1,234,56'],
    ['12,345'],
    ['1.23.4'],
    ['1e3'],
    ['120,'],
    ['₺120'],
    ['12.34,5'],
  ])('refuses %s with a Turkish sentence', (input) => {
    expect(() => toWireDecimal(input)).toThrow(/geçerli bir tutar değil/);
  });

  it('refuses a non-string', () => {
    expect(() => toWireDecimal(undefined)).toThrow(/geçerli bir tutar değil/);
    expect(() => toWireDecimal(12.5)).toThrow(/geçerli bir tutar değil/);
  });
});

describe('isOperatorDecimal', () => {
  it('matches what toWireDecimal accepts', () => {
    expect(isOperatorDecimal('39,99')).toBe(true);
    expect(isOperatorDecimal('39.99')).toBe(true);
    expect(isOperatorDecimal('1.400')).toBe(false);
    expect(isOperatorDecimal('')).toBe(false);
  });
});

describe('parsePositiveRatio', () => {
  it.each([
    ['1,2', 1.2],
    ['1.2', 1.2],
    ['1', 1],
    [' 0,85 ', 0.85],
    ['1,2345', 1.2345],
  ])('%s → %s', (input, value) => {
    expect(parsePositiveRatio(input)).toBe(value);
  });

  it.each([[''], ['0'], ['0,0'], ['-1'], ['abc'], ['1,2,3'], ['1.234,5'], ['1,23456'], ['1e2']])('refuses %j', (input) => {
    expect(parsePositiveRatio(input)).toBeNull();
  });
});

describe('parseNonNegativeNumber', () => {
  it('allows zero and a comma decimal', () => {
    expect(parseNonNegativeNumber('0')).toBe(0);
    expect(parseNonNegativeNumber('2,5')).toBe(2.5);
    expect(parseNonNegativeNumber('')).toBeNull();
    expect(parseNonNegativeNumber('-1')).toBeNull();
  });
});
