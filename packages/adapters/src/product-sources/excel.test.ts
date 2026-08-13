import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { runProductSourceContractChecks } from '../contract/product-source-contract.js';
import { ExcelProductSource } from './excel.js';

/**
 * Builds a workbook in memory with a **non-default worksheet name and reordered columns** —
 * deliberately unlike the legacy hardcoded `Ürünler`/positional-column import (doc 10 §4) — to
 * prove the mapping is genuinely configurable, not just tolerant of the happy path.
 */
async function buildFixtureWorkbookBase64(): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stok Listesi');
  sheet.addRow(['Stok Kodu', 'Miktar', 'Ürün Adı', 'Birim Maliyet']);
  sheet.addRow(['SKU-1', 10, 'Ürün Bir', 42.5]);
  sheet.addRow(['SKU-2', 0, 'Ürün İki', '17,90']); // comma-decimal, as Turkish Excel often produces
  sheet.addRow(['', 5, 'Blank code row — must be skipped', 5]);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

describe('ExcelProductSource', () => {
  let fileBase64: string;
  const columnMapping = {
    baseStockCode: 'Stok Kodu',
    name: 'Ürün Adı',
    unitCost: 'Birim Maliyet',
    unitStock: 'Miktar',
  };

  beforeAll(async () => {
    fileBase64 = await buildFixtureWorkbookBase64();
  });

  it('passes the product source contract suite', async () => {
    await expect(
      runProductSourceContractChecks(ExcelProductSource, {
        validConfig: { fileBase64, worksheetName: 'Stok Listesi', headerRow: 1, columnMapping },
      }),
    ).resolves.toBeUndefined();
  });

  it('maps rows by configured header text regardless of column order, and skips blank-code rows', async () => {
    const items = [];
    for await (const item of ExcelProductSource.fetch({
      fileBase64,
      worksheetName: 'Stok Listesi',
      headerRow: 1,
      columnMapping,
    })) {
      items.push(item);
    }
    expect(items).toHaveLength(2); // the blank-code row is skipped
    expect(items[0]).toMatchObject({ baseStockCode: 'SKU-1', name: 'Ürün Bir', unitStock: 10 });
    expect(items[0]?.unitCost.toKurus()).toBe(4250n);
    // Comma-decimal input parses exactly, not through a lossy float round-trip.
    expect(items[1]?.unitCost.toKurus()).toBe(1790n);
  });

  it('testConnection reports missing columns instead of throwing', async () => {
    const result = await ExcelProductSource.testConnection({
      fileBase64,
      worksheetName: 'Stok Listesi',
      headerRow: 1,
      columnMapping: { ...columnMapping, name: 'Nonexistent Column' },
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Nonexistent Column') });
  });

  it('testConnection reports a missing worksheet instead of throwing', async () => {
    const result = await ExcelProductSource.testConnection({
      fileBase64,
      worksheetName: 'Does Not Exist',
      headerRow: 1,
      columnMapping,
    });
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Does Not Exist') });
  });

  it('defaults to the first worksheet when none is named', async () => {
    const items = [];
    for await (const item of ExcelProductSource.fetch({ fileBase64, headerRow: 1, columnMapping })) {
      items.push(item);
    }
    expect(items).toHaveLength(2);
  });
});
