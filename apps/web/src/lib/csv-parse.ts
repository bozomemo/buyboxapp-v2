/**
 * Reading a spreadsheet an operator saved out of Excel — the mechanics shared by every import
 * this app accepts (the seller policy list, doc 06 §12.4 Faz 5; the brand's reference price
 * list, 2026-09-03).
 *
 * Extracted from `seller-policy-import.ts` when the second importer arrived, because all three
 * problems here are properties of *Turkish Excel*, not of either feature: the file is
 * semicolon-separated on a comma-decimal locale, the header may be typed in any casing with any
 * diacritics, and our own exports write a BOM. Solving them twice would mean fixing them once.
 *
 * Hand-written rather than a dependency: the shape accepted is narrow, and the failure mode of a
 * general CSV library here — quietly accepting a file it reads differently than Excel does — is
 * worse than the code it saves.
 */

/**
 * Lower-cases and strips Turkish diacritics so `Satıcı Kodu`, `SATICI KODU` and `satici kodu` are
 * one header.
 *
 * `toLocaleLowerCase('tr')` is used deliberately: in Turkish, `I` lower-cases to `ı` and not to
 * `i`, so the default locale turns `SATICI` into `satici` on one machine and something else on
 * another. Folding after that removes the distinction entirely, which is right for matching a
 * header and would be wrong for anything we store.
 */
export function foldHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');
}

/**
 * Splits one CSV line, honouring quoted fields and doubled quotes inside them.
 *
 * Turkish Excel writes **semicolons**: on a comma-decimal locale the list separator is `;`, so a
 * file saved from the operator's own Excel would not parse at all under a comma-only reader.
 */
export function splitLine(line: string, separator: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Whichever of `,` and `;` the header line uses more. Excel writes one or the other by locale. */
export function detectSeparator(headerLine: string): string {
  return (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ';' : ',';
}

export interface CsvTable {
  /** 1-based line of the header row as the operator sees it in Excel. */
  readonly headerLine: number;
  readonly headers: readonly string[];
  readonly separator: string;
  /** Non-blank rows after the header, each with its own 1-based line number. */
  readonly rows: readonly { readonly line: number; readonly fields: readonly string[] }[];
}

/**
 * Splits a whole file into a header and its rows, or says the file is empty.
 *
 * Blank lines are skipped rather than reported: Excel routinely writes a trailing one, and a
 * refusal over it would be an error message about nothing.
 */
export function parseCsvTable(text: string): CsvTable | null {
  // The BOM our own exports write, stripped so it does not become part of the first header.
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => l.trim() !== '');
  if (headerIndex === -1) return null;

  const separator = detectSeparator(lines[headerIndex]!);
  const headers = splitLine(lines[headerIndex]!, separator).map(foldHeader);
  const rows: { line: number; fields: string[] }[] = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    rows.push({ line: i + 1, fields: splitLine(raw, separator) });
  }
  return { headerLine: headerIndex + 1, headers, separator, rows };
}
