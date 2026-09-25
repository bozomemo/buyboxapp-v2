import { describe, expect, it } from 'vitest';
import { displayText, dropRepeatedBrand } from './display-text.js';

describe('displayText', () => {
  const cases: { raw: unknown; expected: string | null }[] = [
    // The live Hepsiburada label shape: a left-to-right mark in front.
    { raw: '\u200eOrijen Kitten Yavru Kedi Maması 1,8 Kg', expected: 'Orijen Kitten Yavru Kedi Maması 1,8 Kg' },
    { raw: 'Sensible 33 Kedi Maması 2 Kg ', expected: 'Sensible 33 Kedi Maması 2 Kg' },
    { raw: 'Royal\u00a0Canin  Kitten', expected: 'Royal Canin Kitten' },
    { raw: 'Kısırlaştırılmış İştah Açıcı Öğün', expected: 'Kısırlaştırılmış İştah Açıcı Öğün' },
    { raw: '\u200e \u200f', expected: null },
    { raw: '', expected: null },
    { raw: 42, expected: null },
    { raw: null, expected: null },
  ];
  for (const { raw, expected } of cases) {
    it(`${JSON.stringify(raw)} → ${JSON.stringify(expected)}`, () => {
      expect(displayText(raw)).toBe(expected);
    });
  }
});

describe('dropRepeatedBrand', () => {
  it.each([
    ['Orijen Orijen Kitten Yavru Kedi Maması 1,8 Kg', 'Orijen', 'Orijen Kitten Yavru Kedi Maması 1,8 Kg'],
    ['ORIJEN Orijen Six Fish 2 kg', 'Orijen', 'Orijen Six Fish 2 kg'],
    ['Orijen Kitten', 'Orijen', 'Orijen Kitten'],
    ['Orijen Orijenal Tat', 'Orijen', 'Orijen Orijenal Tat'],
    ['Orijen Orijen Kitten', null, 'Orijen Orijen Kitten'],
  ] as const)('%s (%s) → %s', (name, brand, expected) => {
    expect(dropRepeatedBrand(name, brand)).toBe(expected);
  });
});
