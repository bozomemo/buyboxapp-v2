/**
 * A money amount as an operator types it → the culture-invariant decimal the API and
 * `Money.fromMajorUnitsString` read ("120.50").
 *
 * The screens show money the Turkish way ("120,50 ₺") and every operator types it that way, but
 * the forms used to accept only the wire format: "39,99" was refused in the fee bands and "120,50"
 * on the stock screen came back as `Money: invalid decimal string "120,50"` (2026-11-19
 * walkthrough). Both spellings are accepted here:
 *
 * - **With a comma:** the comma is the decimal separator and dots may only group thousands
 *   ("1.234,56").
 * - **Without a comma:** a dot is the decimal separator, as the forms prefill ("11.00").
 *
 * Anything else is refused rather than guessed at — "1.400" could be 1,40 or 1 400, and a fee off
 * by a thousand would look like a working setting. Pure and import-free, so client forms can
 * validate with it too (`client-imports.test.ts`).
 */
const WITH_COMMA = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/;
const WITHOUT_COMMA = /^-?\d+(?:\.\d{1,2})?$/;

export function isOperatorDecimal(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  const text = input.trim();
  return WITH_COMMA.test(text) || WITHOUT_COMMA.test(text);
}

/** Throws a `RangeError` whose message can be shown to the operator as it is. */
export function toWireDecimal(input: unknown): string {
  const text = typeof input === 'string' ? input.trim() : '';
  const comma = WITH_COMMA.exec(text);
  if (comma) return `${comma[1]}${comma[2]!.replace(/\./g, '')}.${comma[3]}`;
  if (WITHOUT_COMMA.test(text)) return text;
  const shown = typeof input === 'string' ? `"${input.trim()}"` : 'Boş değer';
  throw new RangeError(`${shown} geçerli bir tutar değil. Örnek: 120,50`);
}
