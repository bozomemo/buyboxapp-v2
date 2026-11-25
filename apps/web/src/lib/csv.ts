/**
 * The one CSV-export implementation every table screen shares (doc 06 §10, R-UI-12 —
 * "every table screen offers Excel/CSV export", customer feedback 2026-08-25).
 *
 * Excel opens a `.csv` file directly, so a CSV — not a real `.xlsx` — is what "Excel export"
 * means throughout this app; doc 06 §6 already used "CSV/Excel" interchangeably for the one
 * screen that had this before. Lifted unchanged out of `competitors-client.tsx`, which had its
 * own copy before every other grid grew one too.
 *
 * `\uFEFF` (byte-order mark) is prepended so Excel on Windows — the operator's own
 * environment — detects UTF-8 and renders Turkish characters (İ, ş, ğ, ü, ö, ç) correctly
 * instead of guessing the system codepage and mangling them.
 */
export function toCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(SEPARATOR)];
  for (const row of rows) {
    lines.push(headers.map((h) => cell(row[h])).join(SEPARATOR));
  }
  return lines.join('\n');
}

/**
 * `;` and the decimal comma (review 2026-11-25 O11) — what Excel on a Turkish Windows expects, and
 * what the Stok export already wrote. With `,` the file opened as one column on that Excel.
 */
const SEPARATOR = ';';
const DECIMAL_TEXT = /^-?\d+\.\d+$/;

/**
 * A number, or a string that is a plain decimal (`kurusToDecimal`'s `"49.90"`), is written bare with
 * a decimal comma so Excel reads it as a number. Everything else is quoted text — which keeps a
 * barcode's leading zero and a tax number's digits exactly as they are.
 */
function cell(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).replace('.', ',');
  const text = value === null || value === undefined ? '' : String(value);
  if (DECIMAL_TEXT.test(text)) return text.replace('.', ',');
  return `"${text.replace(/"/g, '""')}"`;
}

/** Builds the CSV and starts the browser download — the click handler every export button calls. */
export function downloadCsv(filename: string, rows: readonly Record<string, unknown>[]): void {
  // Written as an escape: an invisible character in source is a trap (and a lint error in a comment).
  const csv = '\uFEFF' + toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
