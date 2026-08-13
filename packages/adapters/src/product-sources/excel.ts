/**
 * The `Excel` product source (doc 10 §4). Column mapping is configured in the UI, not
 * hardcoded — the legacy import hardcoded worksheet name `Ürünler` and read columns by
 * position (doc 10 §4 note); this reads the header row and maps by configured header text.
 */
import { Money } from '@buybox/shared';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { ConnectionTestResult } from '../ports/marketplace.js';
import type { IProductSource, StockItemInput } from '../ports/product-source.js';

export const ExcelColumnMappingSchema = z.object({
  baseStockCode: z.string().min(1),
  name: z.string().min(1),
  unitCost: z.string().min(1),
  unitStock: z.string().min(1),
  sourceRef: z.string().optional(),
});

export const ExcelSourceConfigSchema = z.object({
  /** The uploaded workbook, base64-encoded — the web layer reads the multipart upload. */
  fileBase64: z.string().min(1),
  /** Defaults to the workbook's first sheet — never a hardcoded name. */
  worksheetName: z.string().optional(),
  /** 1-based row containing the column headers referenced by `columnMapping`. */
  headerRow: z.number().int().min(1).default(1),
  /** Maps each logical field to the header text of the column that holds it. */
  columnMapping: ExcelColumnMappingSchema,
});

export type ExcelSourceConfig = z.infer<typeof ExcelSourceConfigSchema>;

class ExcelSourceError extends Error {}

function buildHeaderIndex(worksheet: ExcelJS.Worksheet, headerRow: number): Map<string, number> {
  const index = new Map<string, number>();
  const row = worksheet.getRow(headerRow);
  row.eachCell((cell, colNumber) => {
    const text = String(cell.value ?? '').trim();
    if (text) index.set(text, colNumber);
  });
  return index;
}

function cellText(worksheet: ExcelJS.Worksheet, row: number, col: number): string {
  const value = worksheet.getRow(row).getCell(col).value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) return String((value as { text: unknown }).text);
  if (typeof value === 'object' && 'result' in value) return String((value as { result: unknown }).result);
  return String(value).trim();
}

function moneyFromCellText(text: string, fieldLabel: string): Money {
  const normalised = text.replace(',', '.').trim();
  const asNumber = Number(normalised);
  if (!Number.isFinite(asNumber)) {
    throw new ExcelSourceError(`Excel import: "${fieldLabel}" cell is not a number: "${text}"`);
  }
  return Money.fromMajorUnitsString(asNumber.toFixed(2));
}

async function loadWorksheet(config: ExcelSourceConfig): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled types predate @types/node's generic `Buffer<T>`; the runtime value is a
  // plain Buffer either way.
  const bytes = Buffer.from(config.fileBase64, 'base64');
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = config.worksheetName
    ? workbook.getWorksheet(config.worksheetName)
    : workbook.worksheets[0];
  if (!worksheet) {
    throw new ExcelSourceError(
      config.worksheetName
        ? `Excel import: worksheet "${config.worksheetName}" not found`
        : 'Excel import: workbook has no worksheets',
    );
  }
  return worksheet;
}

export const ExcelProductSource: IProductSource = {
  code: 'excel',
  displayName: 'Excel',
  status: 'available',
  configSchema: ExcelSourceConfigSchema,

  async testConnection(rawConfig: unknown): Promise<ConnectionTestResult> {
    try {
      const config = ExcelSourceConfigSchema.parse(rawConfig);
      const worksheet = await loadWorksheet(config);
      const headerIndex = buildHeaderIndex(worksheet, config.headerRow);
      const missing = Object.entries(config.columnMapping)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .filter(([, header]) => !headerIndex.has(header));
      if (missing.length > 0) {
        return {
          ok: false,
          error: `Column(s) not found in header row: ${missing.map(([, h]) => h).join(', ')}`,
        };
      }
      return { ok: true, detail: `Found ${worksheet.rowCount - config.headerRow} data row(s)` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  async *fetch(rawConfig: unknown): AsyncIterable<StockItemInput> {
    const config = ExcelSourceConfigSchema.parse(rawConfig);
    const worksheet = await loadWorksheet(config);
    const headerIndex = buildHeaderIndex(worksheet, config.headerRow);

    const columnFor = (header: string): number => {
      const col = headerIndex.get(header);
      if (col === undefined) {
        throw new ExcelSourceError(
          `Excel import: column "${header}" not found in header row ${config.headerRow}`,
        );
      }
      return col;
    };

    const cols = {
      baseStockCode: columnFor(config.columnMapping.baseStockCode),
      name: columnFor(config.columnMapping.name),
      unitCost: columnFor(config.columnMapping.unitCost),
      unitStock: columnFor(config.columnMapping.unitStock),
      sourceRef: config.columnMapping.sourceRef ? columnFor(config.columnMapping.sourceRef) : null,
    };

    for (let rowNum = config.headerRow + 1; rowNum <= worksheet.rowCount; rowNum += 1) {
      const baseStockCode = cellText(worksheet, rowNum, cols.baseStockCode);
      if (!baseStockCode) continue; // blank row — never coerced into a phantom stock item

      const unitStockText = cellText(worksheet, rowNum, cols.unitStock);
      const unitStock = Number.parseInt(unitStockText, 10);
      if (!Number.isFinite(unitStock)) {
        throw new ExcelSourceError(
          `Excel import row ${rowNum}: "${config.columnMapping.unitStock}" is not an integer: "${unitStockText}"`,
        );
      }

      yield {
        baseStockCode,
        name: cellText(worksheet, rowNum, cols.name),
        unitCost: moneyFromCellText(
          cellText(worksheet, rowNum, cols.unitCost),
          config.columnMapping.unitCost,
        ),
        unitStock,
        sourceRef: cols.sourceRef ? cellText(worksheet, rowNum, cols.sourceRef) || undefined : undefined,
      };
    }
  },
};
