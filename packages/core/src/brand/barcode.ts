/**
 * What a barcode string actually is (2026-09-25).
 *
 * Barcodes are the only honest key for matching one product across marketplaces (doc 17 §2.4,
 * api-references §2.14), so a value that merely *looks* like one poisons every comparison it
 * enters. Two kinds were found stored on the live install that day: `8.69E+12`, a 13-digit
 * barcode Excel had turned into scientific notation before the price list was saved, and
 * `HBDFBD21352107`-style codes that Hepsiburada's product page states under `barcode` but that
 * are merchant stock codes, not GTINs — five of five sampled.
 */

export type BarcodeKind =
  /** GTIN-8, -12 (UPC), -13 (EAN) or -14 with a correct check digit. */
  | 'gtin'
  /** Excel's scientific notation — the digits are already lost, so it can never be repaired. */
  | 'scientific'
  /** Anything else: possibly a brand's internal code, never a cross-marketplace key. */
  | 'other';

const SCIENTIFIC = /^\d+(?:[.,]\d+)?e\+?\d+$/i;

export function classifyBarcode(raw: string): BarcodeKind {
  const value = raw.trim();
  if (SCIENTIFIC.test(value)) return 'scientific';
  return isValidGtin(value) ? 'gtin' : 'other';
}

/** GS1 mod-10: weights 3,1,3,1… from the digit next to the check digit, leftwards. */
export function isValidGtin(value: string): boolean {
  if (!/^(?:\d{8}|\d{12,14})$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((digit, index) => {
    sum += digit * (index % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}
