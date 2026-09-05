/**
 * Table-driven, because every mistake this parser can make is a *silent* one. A price read an
 * order of magnitude low makes every seller on the product a violation; a row matched to the
 * wrong product attaches a brand's list price to somebody else's article; a partially imported
 * file leaves the operator believing a list is in force. None of those throw.
 */
import { describe, expect, it } from 'vitest';
import { parseReferencePriceCsv, parseTurkishDecimal } from './reference-price-import';

describe('parseTurkishDecimal', () => {
  it.each([
    ['249,90', 249_90n],
    ['249.90', 249_90n],
    ['1.249,90', 1249_90n],
    ['1,249.90', 1249_90n],
    ['1249', 1249_00n],
    ['249,9', 249_90n],
    ['249,90 TL', 249_90n],
    ['249,90 ₺', 249_90n],
    ['1.234.567,89', 1234567_89n],
  ])('reads %s as %s kuruş', (text, expected) => {
    expect(parseTurkishDecimal(text)).toBe(expected);
  });

  /**
   * The expensive one. `1.249` is a thousands group in a Turkish file and a decimal in an
   * English one, and the file does not say which it is. Read as a decimal it is 1,25 ₺ — three
   * orders of magnitude out, and every seller in the market becomes a violation of it.
   */
  it('reads three digits after the only separator as a thousands group, not a fraction', () => {
    expect(parseTurkishDecimal('1.249')).toBe(1249_00n);
    expect(parseTurkishDecimal('1,249')).toBe(1249_00n);
    // Both locales agree on this one, which is why the rule is safe to apply without knowing
    // which locale wrote the file.
    expect(parseTurkishDecimal('12,345')).toBe(12345_00n);
  });

  it.each(['', 'bedava', 'abc123', '—'])('refuses %s rather than guessing', (text) => {
    expect(parseTurkishDecimal(text)).toBeNull();
  });
});

const HEADER = 'Barkod;Ürün;Tavsiye Edilen Satış Fiyatı';

describe('parseReferencePriceCsv', () => {
  it('reads a semicolon file Turkish Excel wrote, with a Turkish decimal', () => {
    const result = parseReferencePriceCsv(`${HEADER}\n8690632000015;Whiskas 1,4 Kg;249,90\n`, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toEqual([
      {
        line: 2,
        barcode: '8690632000015',
        marketplaceCode: null,
        productRef: null,
        referencePrice: 249_90n,
        label: 'Whiskas 1,4 Kg',
      },
    ]);
  });

  it('reads a comma file too', () => {
    const result = parseReferencePriceCsv('barcode,list price\n8690632000015,249.90\n', null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows[0]!.referencePrice).toBe(249_90n);
  });

  it('matches by product ref when a marketplace is given, and defaults the marketplace when it is not', () => {
    const result = parseReferencePriceCsv('Ürün Kodu;Fiyat\n757251065;120,00\n', 'trendyol');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({
      barcode: null,
      marketplaceCode: 'trendyol',
      productRef: '757251065',
    });
  });

  /**
   * A barcode is marketplace-independent by construction. Pinning the default marketplace onto
   * one would halve the match rate on a cross-marketplace catalogue for no gain.
   */
  it('does not pin a default marketplace onto a barcode row', () => {
    const result = parseReferencePriceCsv(`${HEADER}\n8690632000015;X;10,00\n`, 'trendyol');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows[0]!.marketplaceCode).toBeNull();
  });

  it('matches a row carrying both identities by barcode, and drops the ref rather than keeping two', () => {
    const result = parseReferencePriceCsv('Barkod;Ürün Kodu;Fiyat\n869;757251065;10,00\n', 'trendyol');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows[0]).toMatchObject({ barcode: '869', productRef: null, marketplaceCode: null });
    }
  });

  it('refuses a file with no price column, naming the headers it would accept', () => {
    const result = parseReferencePriceCsv('Barkod;Ürün\n869;X\n', null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.message).toContain('fiyat sütunu yok');
  });

  it('refuses a file that identifies products only by name', () => {
    const result = parseReferencePriceCsv('Ürün;Fiyat\nWhiskas;249,90\n', 'trendyol');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.message).toContain('isimle eşleştirilmez');
  });

  it('refuses a product ref with no marketplace anywhere, naming the row', () => {
    const result = parseReferencePriceCsv('Ürün Kodu;Fiyat\n757251065;120,00\n', null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.message).toContain('pazaryeri belirtilmemiş');
  });

  it('treats zero as a missing price, not a cheap one', () => {
    const result = parseReferencePriceCsv(`${HEADER}\n869;X;0\n`, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.message).toContain('referans fiyat olamaz');
  });

  /**
   * All or nothing, and every bad line reported at once — the same posture as the seller policy
   * import, for the same reason: a half-applied list is one the operator believes is in force.
   */
  it('imports nothing when any row fails, and reports every failure with its line number', () => {
    const result = parseReferencePriceCsv(
      `${HEADER}\n869;İyi;249,90\n;Kimliksiz;10,00\n871;Fiyatsız;bedava\n`,
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it('says an empty file is empty rather than importing nothing quietly', () => {
    expect(parseReferencePriceCsv('', null)).toEqual({
      ok: false,
      errors: [{ line: 1, message: 'Dosya boş.' }],
    });
  });

  it('reports a header-only file as having no rows', () => {
    const result = parseReferencePriceCsv(`${HEADER}\n`, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.message).toContain('hiç satır yok');
  });
});
