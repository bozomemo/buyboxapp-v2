import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

/**
 * Review 2026-11-25 O11: the Stok export was `;`-separated with decimal commas while every other
 * "Excel'e aktar" file was `,`-separated with decimal points. Excel on a Turkish Windows reads the
 * first and piles the second into one column. One format now: the one Turkish Excel opens.
 */
describe('toCsv', () => {
  it('separates columns with a semicolon', () => {
    expect(toCsv([{ Ad: 'Mama', Adet: 3 }]).split('\n')).toEqual(['Ad;Adet', '"Mama";3']);
  });

  it('writes decimals with a comma, so Turkish Excel reads them as numbers', () => {
    expect(toCsv([{ Fiyat: '49.90', Oran: 12.5, Eksi: '-3.25' }]).split('\n')[1]).toBe('49,90;12,5;-3,25');
  });

  it('keeps a code with leading zeros as text, untouched', () => {
    expect(toCsv([{ Barkod: '0869000000001', Vergi: '1234567890' }]).split('\n')[1]).toBe(
      '"0869000000001";"1234567890"',
    );
  });

  it('quotes a value containing the separator, and doubles inner quotes the CSV way', () => {
    expect(toCsv([{ Not: 'a;b "c"' }]).split('\n')[1]).toBe('"a;b ""c"""');
  });
});
