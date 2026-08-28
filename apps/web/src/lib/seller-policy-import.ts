/**
 * Parsing an operator's seller list into policy rules (doc 06 §12.4, Faz 5).
 *
 * A brand owner's authorised-distributor list arrives as a spreadsheet — that is how these lists
 * exist in the world, and asking someone to retype forty rows into a form is how the feature
 * goes unused. Excel writes CSV, which is what this reads.
 *
 * Pure and separate from the route so the awkward part — what counts as a row, what counts as a
 * refusal — is table-testable without a database or an HTTP request.
 *
 * ## What it will not do
 *
 * **It never matches a seller by name.** A row must carry a marketplace seller code or a tax
 * number; a row with only a company name is rejected, by name, with its line number. That is
 * the one rule this whole feature rests on (doc 05 §5): names collide, change, and are chosen by
 * the seller, so a name match would apply a real company's policy to an unrelated company while
 * looking like it worked. A name *column* is read and kept, but only as a label to show back to
 * the operator — never to match on.
 *
 * **It rejects the whole file rather than importing part of it.** A half-applied policy list is
 * worse than none: the operator believes the list is in force, and the rows that failed are
 * exactly the ones nobody looks at again. Errors come back together, with line numbers, so one
 * pass over the spreadsheet fixes all of them.
 */

export type ImportedStatus = 'authorised' | 'blocked';

export interface ImportedPolicyRow {
  /** 1-based line in the file as the operator sees it in Excel, header included. */
  readonly line: number;
  readonly marketplaceCode: string | null;
  readonly sellerRef: string | null;
  readonly taxNumber: string | null;
  readonly status: ImportedStatus;
  readonly note: string | null;
  /** Read for display only. Never used to match a seller — see the module header. */
  readonly sellerName: string | null;
}

export interface ImportError {
  readonly line: number;
  readonly message: string;
}

export type ImportResult =
  | { readonly ok: true; readonly rows: readonly ImportedPolicyRow[] }
  | { readonly ok: false; readonly errors: readonly ImportError[] };

/**
 * Header names accepted for each field, lower-cased and accent-folded.
 *
 * Turkish and English both, because the file may come from the brand owner's own template or
 * from an export of this screen. The status words are the ones a Turkish operator actually
 * types — `yetkili`/`yasakli` — not the English enum they map to.
 */
const HEADERS: Record<keyof Omit<ImportedPolicyRow, 'line'>, readonly string[]> = {
  marketplaceCode: ['pazaryeri', 'marketplace', 'marketplacecode'],
  sellerRef: ['satici kodu', 'saticikodu', 'satici id', 'sellerref', 'seller ref', 'seller id'],
  taxNumber: ['vergi no', 'vergino', 'vergi numarasi', 'taxnumber', 'tax number', 'vkn'],
  status: ['durum', 'status', 'yetki'],
  note: ['not', 'note', 'aciklama'],
  sellerName: ['satici', 'satici adi', 'unvan', 'seller', 'sellername', 'seller name'],
};

const STATUS_WORDS: Record<string, ImportedStatus> = {
  yetkili: 'authorised',
  authorised: 'authorised',
  authorized: 'authorised',
  beyaz: 'authorised',
  izinli: 'authorised',
  yasak: 'blocked',
  yasakli: 'blocked',
  blocked: 'blocked',
  kara: 'blocked',
  engelli: 'blocked',
};

/**
 * Lower-cases and strips Turkish diacritics so `Satıcı Kodu`, `SATICI KODU` and `satici kodu` are
 * one header.
 *
 * `toLocaleLowerCase('tr')` is used deliberately: in Turkish, `I` lower-cases to `ı` and not to
 * `i`, so the default locale turns `SATICI` into `satici` on one machine and something else on
 * another. Folding after that removes the distinction entirely, which is right for matching a
 * header and would be wrong for anything we store.
 */
function foldHeader(value: string): string {
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
 * Hand-written rather than a dependency because the shape it must accept is narrow — one line,
 * comma or semicolon separated — and because Turkish Excel writes **semicolons**: on a
 * comma-decimal locale the list separator is `;`, so a file saved from the operator's own Excel
 * would not parse at all under a comma-only reader.
 */
function splitLine(line: string, separator: string): string[] {
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
function detectSeparator(headerLine: string): string {
  return (headerLine.match(/;/g)?.length ?? 0) > (headerLine.match(/,/g)?.length ?? 0) ? ';' : ',';
}

/**
 * Parses a whole file. `defaultStatus` fills rows whose file has no status column at all — the
 * common case, because an operator exporting "our authorised distributors" from their own system
 * has a list of sellers and no column saying so.
 */
export function parseSellerPolicyCsv(text: string, defaultStatus: ImportedStatus): ImportResult {
  // The BOM our own exports write, stripped so it does not become part of the first header.
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => l.trim() !== '');
  if (headerIndex === -1) {
    return { ok: false, errors: [{ line: 1, message: 'Dosya boş.' }] };
  }

  const separator = detectSeparator(lines[headerIndex]!);
  const headers = splitLine(lines[headerIndex]!, separator).map(foldHeader);

  const columnOf = (field: keyof typeof HEADERS): number =>
    headers.findIndex((h) => HEADERS[field].includes(h));

  const columns = {
    marketplaceCode: columnOf('marketplaceCode'),
    sellerRef: columnOf('sellerRef'),
    taxNumber: columnOf('taxNumber'),
    status: columnOf('status'),
    note: columnOf('note'),
    sellerName: columnOf('sellerName'),
  };

  if (columns.sellerRef === -1 && columns.taxNumber === -1) {
    return {
      ok: false,
      errors: [
        {
          line: headerIndex + 1,
          message:
            'Dosyada satıcı kodu veya vergi numarası sütunu yok. Satıcılar isimle eşleştirilmez — en az birini ekleyin.',
        },
      ],
    };
  }

  const rows: ImportedPolicyRow[] = [];
  const errors: ImportError[] = [];

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const line = i + 1;
    const fields = splitLine(raw, separator);
    const at = (index: number): string | null => (index === -1 ? null : fields[index]?.trim() || null);

    const sellerRef = at(columns.sellerRef);
    const taxNumber = at(columns.taxNumber);
    const marketplaceCode = at(columns.marketplaceCode);
    const sellerName = at(columns.sellerName);

    if (sellerRef === null && taxNumber === null) {
      errors.push({
        line,
        message: sellerName
          ? `"${sellerName}" için satıcı kodu da vergi numarası da yok. İsimle eşleştirme yapılmaz.`
          : 'Satıcı kodu da vergi numarası da yok.',
      });
      continue;
    }
    // A ref without a marketplace is not an identity: the same digits are different companies on
    // different marketplaces. Caught here, with a line number, rather than as a repository throw
    // that names no row.
    if (sellerRef !== null && marketplaceCode === null) {
      errors.push({ line, message: `"${sellerRef}" için pazaryeri belirtilmemiş.` });
      continue;
    }

    const statusText = at(columns.status);
    let status: ImportedStatus;
    if (statusText === null) {
      status = defaultStatus;
    } else {
      const parsed = STATUS_WORDS[foldHeader(statusText)];
      if (parsed === undefined) {
        errors.push({
          line,
          message: `"${statusText}" bir durum değil. Kullanılabilir: yetkili, yasaklı.`,
        });
        continue;
      }
      status = parsed;
    }

    rows.push({
      line,
      // A row carrying both is ambiguous rather than richer: the two identities can name
      // different companies, and there is no way to tell which the operator meant. The seller
      // code wins because it is the more specific statement, and the tax number is dropped
      // rather than stored alongside — a rule names one seller, one way.
      marketplaceCode: sellerRef !== null ? marketplaceCode : null,
      sellerRef,
      taxNumber: sellerRef !== null ? null : taxNumber,
      status,
      note: at(columns.note),
      sellerName,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  if (rows.length === 0) {
    return { ok: false, errors: [{ line: headerIndex + 1, message: 'Dosyada hiç satır yok.' }] };
  }
  return { ok: true, rows };
}
