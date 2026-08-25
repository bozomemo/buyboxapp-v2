/**
 * Table-driven because every branch here fails silently: a doubled brand, a stray separator or a
 * Turkish case mismatch all produce a plausible-looking label, never an error.
 */
import { describe, expect, it } from 'vitest';
import { withBrand } from './product-name';

describe('withBrand', () => {
  const cases: ReadonlyArray<readonly [string, string | null | undefined, string]> = [
    // The shape the operator asked for (customer feedback 2026-08-25).
    [
      'Sığır Etli Kısırlaştırılmış Kedi Maması 1,4 Kg',
      'Whiskas',
      'Whiskas - Sığır Etli Kısırlaştırılmış Kedi Maması 1,4 Kg',
    ],
    // No brand recorded — every Hepsiburada listing today (doc 06 §12.1).
    ['Sığır Etli Kedi Maması', null, 'Sığır Etli Kedi Maması'],
    ['Sığır Etli Kedi Maması', undefined, 'Sığır Etli Kedi Maması'],
    ['Sığır Etli Kedi Maması', '   ', 'Sığır Etli Kedi Maması'],
    // Titles that already lead with the brand are normalised, not prefixed twice.
    ['Whiskas Sığır Etli Kedi Maması', 'Whiskas', 'Whiskas - Sığır Etli Kedi Maması'],
    ['Whiskas - Sığır Etli Kedi Maması', 'Whiskas', 'Whiskas - Sığır Etli Kedi Maması'],
    ['Whiskas: Sığır Etli Kedi Maması', 'Whiskas', 'Whiskas - Sığır Etli Kedi Maması'],
    ['WHISKAS Sığır Etli Kedi Maması', 'Whiskas', 'Whiskas - Sığır Etli Kedi Maması'],
    // Turkish case folding: `toLowerCase()` would map I→i and miss this pairing.
    ['ILIK Bebek Mendili', 'Ilık', 'Ilık - Bebek Mendili'],
    ['İZMİR Sabunu', 'İzmir', 'İzmir - Sabunu'],
    // A title that is only the brand must not become `Whiskas - `.
    ['Whiskas', 'Whiskas', 'Whiskas'],
    ['', 'Whiskas', 'Whiskas'],
    // A brand that merely *appears* in the title, not at its head, is still prefixed.
    ['Kedi Maması Whiskas', 'Whiskas', 'Whiskas - Kedi Maması Whiskas'],
    // Surrounding whitespace is display noise on both sides.
    ['  Kedi Maması  ', '  Whiskas  ', 'Whiskas - Kedi Maması'],
  ];

  it.each(cases)('names %j with brand %j', (productName, brandName, expected) => {
    expect(withBrand(productName, brandName)).toBe(expected);
  });
});
