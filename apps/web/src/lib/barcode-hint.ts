/**
 * Display-only barcode check for the Stok form (review 2026-11-25). The authoritative check is
 * `classifyBarcode` in `@buybox/core`, which the API applies on save; importing core into a client
 * bundle pulled in Node modules and broke the build, so the form carries this small copy.
 */
export type BarcodeHint = 'gtin' | 'scientific' | 'other';

export function barcodeHint(raw: string): BarcodeHint {
  const value = raw.trim();
  if (/^\d+(?:[.,]\d+)?e\+?\d+$/i.test(value)) return 'scientific';
  if (!/^(?:\d{8}|\d{12,14})$/.test(value)) return 'other';
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => (sum += d * (i % 2 === 0 ? 3 : 1)));
  return (10 - (sum % 10)) % 10 === check ? 'gtin' : 'other';
}
