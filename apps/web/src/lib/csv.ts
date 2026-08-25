/**
 * The one CSV-export implementation every table screen shares (doc 06 §10, R-UI-12 —
 * "every table screen offers Excel/CSV export", customer feedback 2026-08-25).
 *
 * Excel opens a `.csv` file directly, so a CSV — not a real `.xlsx` — is what "Excel export"
 * means throughout this app; doc 06 §6 already used "CSV/Excel" interchangeably for the one
 * screen that had this before. Lifted unchanged out of `competitors-client.tsx`, which had its
 * own copy before every other grid grew one too.
 *
 * `﻿` (byte-order mark) is prepended so Excel on Windows — the operator's own
 * environment — detects UTF-8 and renders Turkish characters (İ, ş, ğ, ü, ö, ç) correctly
 * instead of guessing the system codepage and mangling them.
 */
export function toCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
  }
  return lines.join('\n');
}

/** Builds the CSV and starts the browser download — the click handler every export button calls. */
export function downloadCsv(filename: string, rows: readonly Record<string, unknown>[]): void {
  const csv = '﻿' + toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
