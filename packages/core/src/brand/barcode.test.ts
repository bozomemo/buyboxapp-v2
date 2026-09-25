import { describe, expect, it } from 'vitest';
import { classifyBarcode, isValidGtin, type BarcodeKind } from './barcode.js';

describe('classifyBarcode', () => {
  const cases: { raw: string; expected: BarcodeKind }[] = [
    // Real EAN-13s: one from the Trendyol fixture, one from api-references §2.14.
    { raw: '5998749144220', expected: 'gtin' },
    { raw: '8681002995109', expected: 'gtin' },
    { raw: ' 8681002995109 ', expected: 'gtin' },
    { raw: '96385074', expected: 'gtin' }, // GTIN-8
    { raw: '036000291452', expected: 'gtin' }, // UPC-A
    { raw: '8681002995108', expected: 'other' }, // one check digit off
    { raw: '8.69E+12', expected: 'scientific' }, // the live install's stored value
    { raw: '8,69E+12', expected: 'scientific' },
    { raw: '8.69e12', expected: 'scientific' },
    { raw: 'HBDFBD21352107', expected: 'other' },
    { raw: '0Ptl291314783', expected: 'other' },
    { raw: '12345', expected: 'other' },
    { raw: '', expected: 'other' },
  ];
  for (const { raw, expected } of cases) {
    it(`${JSON.stringify(raw)} → ${expected}`, () => {
      expect(classifyBarcode(raw)).toBe(expected);
    });
  }

  it('rejects the right length with a non-digit', () => {
    expect(isValidGtin('868100299510X')).toBe(false);
  });
});
