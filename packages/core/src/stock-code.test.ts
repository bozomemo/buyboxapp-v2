import { describe, expect, it } from 'vitest';
import { parseStockCode } from './stock-code.js';

describe('parseStockCode (doc 01 §2)', () => {
  it('no dash: base code, unit count 1, not a bundle', () => {
    const result = parseStockCode('12345');
    expect(result).toEqual({
      ok: true,
      value: { raw: '12345', baseCode: '12345', unitCount: 1, isBundle: false },
    });
  });

  it('numeric suffix: a multi-pack', () => {
    const result = parseStockCode('12345-4');
    expect(result.ok && result.value).toMatchObject({ baseCode: '12345', unitCount: 4, isBundle: false });
  });

  it('decimal noise after the numeric suffix is discarded', () => {
    const result = parseStockCode('12345-4.2');
    expect(result.ok && result.value).toMatchObject({ baseCode: '12345', unitCount: 4, isBundle: false });
  });

  it('strips " characters from the suffix before parsing', () => {
    const result = parseStockCode('12345-4"');
    expect(result.ok && result.value).toMatchObject({ baseCode: '12345', unitCount: 4, isBundle: false });
  });

  it.each(['12345-k2', '12345-2k', '12345-K2', '12345-2K'])(
    'bundle marker "%s": unit count forced to 1, isBundle true',
    (code) => {
      const result = parseStockCode(code);
      expect(result.ok && result.value).toMatchObject({ baseCode: '12345', unitCount: 1, isBundle: true });
    },
  );

  it('rejects a code that cannot be parsed rather than defaulting to 1', () => {
    expect(parseStockCode('12345-abc')).toEqual({
      ok: false,
      error: { type: 'UnparseableStockCode', stockCode: '12345-abc' },
    });
    expect(parseStockCode('')).toEqual({ ok: false, error: { type: 'UnparseableStockCode', stockCode: '' } });
    expect(parseStockCode('-4')).toEqual({
      ok: false,
      error: { type: 'UnparseableStockCode', stockCode: '-4' },
    });
  });

  it('trims surrounding whitespace', () => {
    const result = parseStockCode('  12345-4  ');
    expect(result.ok && result.value).toMatchObject({ raw: '12345-4', baseCode: '12345', unitCount: 4 });
  });
});
