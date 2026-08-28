import { describe, expect, it } from 'vitest';
import { parseSellerPolicyCsv } from './seller-policy-import';

function rowsOf(result: ReturnType<typeof parseSellerPolicyCsv>) {
  if (!result.ok) throw new Error(`expected success, got: ${JSON.stringify(result.errors)}`);
  return result.rows;
}

function errorsOf(result: ReturnType<typeof parseSellerPolicyCsv>) {
  if (result.ok) throw new Error('expected failure');
  return result.errors;
}

describe('parseSellerPolicyCsv', () => {
  it('reads a plain comma file', () => {
    const rows = rowsOf(
      parseSellerPolicyCsv(
        'Pazaryeri,Satıcı Kodu,Satıcı,Durum,Not\ntrendyol,12345,Bayi A.Ş.,yetkili,2024 sözleşmesi\n',
        'authorised',
      ),
    );
    expect(rows).toEqual([
      {
        line: 2,
        marketplaceCode: 'trendyol',
        sellerRef: '12345',
        taxNumber: null,
        status: 'authorised',
        note: '2024 sözleşmesi',
        sellerName: 'Bayi A.Ş.',
      },
    ]);
  });

  it('reads the semicolons Turkish Excel writes', () => {
    // On a comma-decimal locale Excel's list separator is `;`, so a file saved from the
    // operator's own Excel would not parse at all under a comma-only reader.
    const rows = rowsOf(
      parseSellerPolicyCsv('Pazaryeri;Satıcı Kodu;Durum\ntrendyol;12345;yasaklı\n', 'authorised'),
    );
    expect(rows[0]).toMatchObject({ sellerRef: '12345', status: 'blocked' });
  });

  it('strips the BOM our own export writes', () => {
    const rows = rowsOf(parseSellerPolicyCsv('﻿Pazaryeri,Satıcı Kodu\ntrendyol,1\n', 'blocked'));
    expect(rows[0]!.marketplaceCode).toBe('trendyol');
  });

  it('matches headers regardless of case, spacing or Turkish diacritics', () => {
    const rows = rowsOf(parseSellerPolicyCsv('PAZARYERI,SATICI KODU\ntrendyol,1\n', 'authorised'));
    expect(rows[0]!.sellerRef).toBe('1');
  });

  it('honours quoted fields containing the separator', () => {
    const rows = rowsOf(
      parseSellerPolicyCsv(
        'Pazaryeri,Satıcı Kodu,Not\ntrendyol,1,"İptal, 2025 Mart itibarıyla"\n',
        'blocked',
      ),
    );
    expect(rows[0]!.note).toBe('İptal, 2025 Mart itibarıyla');
  });

  it('honours doubled quotes inside a quoted field', () => {
    const rows = rowsOf(
      parseSellerPolicyCsv('Pazaryeri,Satıcı Kodu,Not\ntrendyol,1,"""acil"" not"\n', 'blocked'),
    );
    expect(rows[0]!.note).toBe('"acil" not');
  });

  it('falls back to the caller’s status when the file has no status column', () => {
    // The common case: an operator exporting "our authorised distributors" from their own system
    // has a list of sellers and no column saying so.
    const rows = rowsOf(parseSellerPolicyCsv('Pazaryeri,Satıcı Kodu\ntrendyol,1\n', 'authorised'));
    expect(rows[0]!.status).toBe('authorised');
  });

  it('accepts the status words a Turkish operator actually types', () => {
    const rows = rowsOf(
      parseSellerPolicyCsv(
        'Pazaryeri,Satıcı Kodu,Durum\ntrendyol,1,Yetkili\ntrendyol,2,YASAKLI\ntrendyol,3,engelli\n',
        'authorised',
      ),
    );
    expect(rows.map((r) => r.status)).toEqual(['authorised', 'blocked', 'blocked']);
  });

  it('reads a tax-number-only file', () => {
    const rows = rowsOf(parseSellerPolicyCsv('Unvan,Vergi No\nBayi A.Ş.,1234567890\n', 'blocked'));
    expect(rows[0]).toMatchObject({
      sellerRef: null,
      marketplaceCode: null,
      taxNumber: '1234567890',
      sellerName: 'Bayi A.Ş.',
    });
  });

  describe('refusals', () => {
    it('refuses a file with no identity column at all', () => {
      // The rule the whole feature rests on. A file of company names is not a policy list.
      const errors = errorsOf(parseSellerPolicyCsv('Satıcı,Durum\nBayi A.Ş.,yetkili\n', 'authorised'));
      expect(errors[0]!.message).toContain('isimle eşleştirilmez');
    });

    it('refuses a row whose identity cells are empty, and names the company', () => {
      const errors = errorsOf(
        parseSellerPolicyCsv(
          'Pazaryeri,Satıcı Kodu,Satıcı\ntrendyol,1,İyi Bayi\n,,Kötü Bayi\n',
          'blocked',
        ),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]!.line).toBe(3);
      expect(errors[0]!.message).toContain('Kötü Bayi');
    });

    it('refuses a seller code with no marketplace', () => {
      const errors = errorsOf(
        parseSellerPolicyCsv('Pazaryeri,Satıcı Kodu\n,12345\n', 'authorised'),
      );
      expect(errors[0]!.message).toContain('pazaryeri');
    });

    it('refuses an unrecognised status word', () => {
      const errors = errorsOf(
        parseSellerPolicyCsv('Pazaryeri,Satıcı Kodu,Durum\ntrendyol,1,belki\n', 'authorised'),
      );
      expect(errors[0]!.message).toContain('belki');
    });

    it('rejects the whole file rather than importing the good rows', () => {
      // A half-applied policy list is worse than none: the operator believes the list is in
      // force, and the rows that failed are exactly the ones nobody looks at again.
      const result = parseSellerPolicyCsv(
        'Pazaryeri,Satıcı Kodu\ntrendyol,1\ntrendyol,\ntrendyol,3\n',
        'authorised',
      );
      expect(result.ok).toBe(false);
    });

    it('reports every bad row at once, with line numbers', () => {
      // One pass over the spreadsheet fixes all of them.
      const errors = errorsOf(
        parseSellerPolicyCsv(
          'Pazaryeri,Satıcı Kodu,Durum\ntrendyol,1,belki\ntrendyol,,yetkili\ntrendyol,3,olabilir\n',
          'authorised',
        ),
      );
      expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    });

    it('refuses an empty file and a header-only file distinctly', () => {
      expect(errorsOf(parseSellerPolicyCsv('', 'authorised'))[0]!.message).toContain('boş');
      expect(
        errorsOf(parseSellerPolicyCsv('Pazaryeri,Satıcı Kodu\n', 'authorised'))[0]!.message,
      ).toContain('hiç satır yok');
    });
  });

  it('keeps one identity when a row carries both', () => {
    // The two identities can name different companies and there is no way to tell which was
    // meant, so the more specific one wins and the other is dropped rather than stored beside it.
    const rows = rowsOf(
      parseSellerPolicyCsv(
        'Pazaryeri,Satıcı Kodu,Vergi No\ntrendyol,12345,1234567890\n',
        'authorised',
      ),
    );
    expect(rows[0]).toMatchObject({ sellerRef: '12345', taxNumber: null });
  });

  it('skips blank lines rather than failing on them', () => {
    // Excel routinely leaves a trailing newline, and operators leave spacer rows.
    const rows = rowsOf(
      parseSellerPolicyCsv('Pazaryeri,Satıcı Kodu\ntrendyol,1\n\ntrendyol,2\n\n', 'authorised'),
    );
    expect(rows.map((r) => r.sellerRef)).toEqual(['1', '2']);
  });

  it('numbers lines the way Excel does, header included', () => {
    const rows = rowsOf(parseSellerPolicyCsv('Pazaryeri,Satıcı Kodu\ntrendyol,1\n', 'authorised'));
    expect(rows[0]!.line).toBe(2);
  });
});
