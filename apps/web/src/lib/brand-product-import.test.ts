// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseBrandImportFile } from './brand-product-import';

describe('parseBrandImportFile', () => {
  it('reports a file that is not a readable workbook instead of throwing', async () => {
    const fileBase64 = Buffer.from('bu bir excel dosyası değil').toString('base64');
    const result = await parseBrandImportFile({ fileBase64, fileName: 'urunler.xlsx' });
    expect(result).toEqual({
      ok: false,
      error: 'Dosya okunamadı: bozuk ya da gerçek bir Excel (.xlsx) dosyası değil.',
    });
  });
});
