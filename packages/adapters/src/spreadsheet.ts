/**
 * Reading an `.xlsx` workbook as **text**, for the imports an operator drives from a screen
 * (doc 17 §3.1).
 *
 * Text, deliberately, and this is the whole reason the module exists: every amount in this system
 * is `bigint` kuruş and is parsed by one exact parser that reads `1.249,90` and `1249.90` alike
 * (CLAUDE.md, `reference-price-import.ts`). A cell read as a JavaScript number has already been
 * through a float and has already lost the question of what the operator typed — `1.249` would
 * arrive as `1.249` and be priced at 1,25 ₺ instead of 1.249 ₺. So this returns strings and lets
 * the caller's parser decide.
 *
 * `exceljs` is already a dependency here (the Excel product source, doc 10 §4); this adds no new
 * one.
 */
import ExcelJS from 'exceljs';

export interface SpreadsheetTable {
  /** 1-based row of the header, as the operator sees it in Excel. */
  readonly headerLine: number;
  readonly headers: readonly string[];
  readonly rows: readonly { readonly line: number; readonly fields: readonly string[] }[];
}

/**
 * One cell as text.
 *
 * A cell is not always a scalar: a formula arrives as `{ formula, result }` and rich text as
 * `{ richText: [...] }`. Both are read for their *value*, because an operator who typed a formula
 * to compute a price means the price. A date is left as an ISO string rather than guessed at —
 * no column of this import is a date, so a date is a mistake and should look like one.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .join('')
        .trim();
    }
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('hyperlink' in value && typeof value.hyperlink === 'string') return value.hyperlink.trim();
  }
  return String(value).trim();
}

/**
 * The first worksheet's header row and every non-empty row after it.
 *
 * The header is the **first row with any content** — the same rule `parseCsvTable` applies to a
 * CSV, so a list behaves identically whichever way it was saved. A file with a title line above
 * the table therefore has its title read as the header, and the caller answers by naming the line
 * it looked at; hunting for the "real" header further down would mean guessing which row is data.
 * Rows where every cell is empty are skipped — Excel writes trailing ones.
 */
export async function readXlsxTable(
  fileBase64: string,
  worksheetName?: string,
): Promise<SpreadsheetTable | null> {
  const workbook = new ExcelJS.Workbook();
  const bytes = Buffer.from(fileBase64, 'base64');
  // Same cast as the Excel product source: exceljs's declared `Buffer` predates Node's generic one.
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = worksheetName ? workbook.getWorksheet(worksheetName) : workbook.worksheets[0];
  if (!worksheet) return null;

  const table: { line: number; fields: string[] }[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const fields: string[] = [];
    // `row.values` is 1-based with a hole at index 0; `eachCell` skips empty cells entirely, so
    // neither is read directly — the column count comes from the sheet so blanks keep their place.
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      fields.push(cellText(row.getCell(column).value));
    }
    if (fields.some((field) => field !== '')) table.push({ line: rowNumber, fields });
  });

  const header = table.shift();
  if (!header) return null;
  return { headerLine: header.line, headers: header.fields, rows: table };
}
