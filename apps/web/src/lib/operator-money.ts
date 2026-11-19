/**
 * A money amount as an operator types it → the culture-invariant decimal the API and
 * `Money.fromMajorUnitsString` read ("120.50").
 *
 * The screens show money the Turkish way ("120,50 ₺") and every operator types it that way, but
 * the forms used to accept only the wire format: "39,99" was refused in the fee bands and "120,50"
 * on the stock screen came back as `Money: invalid decimal string "120,50"` (2026-11-19
 * walkthrough).
 *
 * One reading for the whole application (product owner, 2026-11-19: a price is TL wherever it
 * appears), the Turkish one the brand module already used:
 *
 * - **A comma** is the decimal separator, with one or two digits after it; dots before it group
 *   thousands ("1.234,56").
 * - **Dots without a comma** group thousands when every group has three digits ("1.400" is
 *   1 400 ₺, "12.345.678"); a single dot with one or two digits after it is still read as a
 *   decimal ("39.99"), the way the server sends amounts.
 * - A "₺" or "TL" around the number is ignored.
 *
 * Anything else ("400,505", "1.40.0", "1,400.50") is refused rather than guessed at. Pure and
 * import-free, so client forms can validate with it too (`client-imports.test.ts`).
 */
const WITH_COMMA = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/;
const GROUPED = /^(-?)(\d{1,3}(?:\.\d{3})+)$/;
const DOT_DECIMAL = /^-?\d+(?:\.\d{1,2})?$/;

function bare(input: string): string {
  return input
    .trim()
    .replace(/ /g, ' ')
    .replace(/^₺\s*/, '')
    .replace(/\s*(₺|TL)$/i, '')
    .trim();
}

function wire(text: string): string | null {
  const comma = WITH_COMMA.exec(text);
  if (comma) return `${comma[1]}${comma[2]!.replace(/\./g, '')}.${comma[3]}`;
  const grouped = GROUPED.exec(text);
  if (grouped) return `${grouped[1]}${grouped[2]!.replace(/\./g, '')}`;
  if (DOT_DECIMAL.test(text)) return text;
  return null;
}

export function isOperatorDecimal(input: unknown): boolean {
  return typeof input === 'string' && wire(bare(input)) !== null;
}

/** A typed amount that is not one. Its message is a Turkish sentence for the operator. */
export class AmountError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = 'AmountError';
  }
}

/** Throws an {@link AmountError} whose message can be shown to the operator as it is. */
export function toWireDecimal(input: unknown): string {
  const result = typeof input === 'string' ? wire(bare(input)) : null;
  if (result !== null) return result;
  const shown = typeof input === 'string' && input.trim() !== '' ? `"${input.trim()}"` : 'Boş değer';
  throw new AmountError(`${shown} geçerli bir tutar değil. Örnek: 1.250,50`);
}

/**
 * A wire decimal ("1500.00") as a money field shows it ("1.500,00"): what the operator would
 * type, so a prefilled form reads the same as every other price on screen. Text that is not a
 * wire decimal is returned as it is.
 */
export function toOperatorDecimal(wireText: string): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(wireText.trim());
  if (!match) return wireText;
  const [, sign, whole, fraction = ''] = match;
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped},${fraction.padEnd(2, '0')}`;
}

const RATIO = /^\d+(?:[.,]\d{1,4})?$/;

/**
 * A positive factor as an operator types it ("1,2" or "1.2") → the number, or `null` when it is
 * not one. For the stock screen's price multiplier, which was a `type="number"` field: in a
 * browser whose locale reads a dot decimal, "1,2" became 12, and an emptied field became 0.
 * Not money (doc 02: rates and multipliers are `number`), so no grouping separators.
 */
export function parsePositiveRatio(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!RATIO.test(text)) return null;
  const value = Number(text.replace(',', '.'));
  return value > 0 ? value : null;
}

/** As {@link parsePositiveRatio}, but zero is allowed — for thresholds whose floor is 0. */
export function parseNonNegativeNumber(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!RATIO.test(text)) return null;
  return Number(text.replace(',', '.'));
}

/** `obj` with each of `keys` shown as a money field shows it ({@link toOperatorDecimal}). */
export function showMoneyFields<T extends Record<string, unknown>>(obj: T, keys: readonly (keyof T)[]): T {
  const out = { ...obj };
  for (const key of keys) {
    const value = out[key];
    if (typeof value === 'string') (out as Record<keyof T, unknown>)[key] = toOperatorDecimal(value);
  }
  return out;
}

/** Fee bands as their form shows them: edge and amount in TL, an empty edge left empty. */
export function showBands<B extends { edge: string; amount: string }>(bands: readonly B[]): B[] {
  return bands.map((b) => ({ ...b, edge: toOperatorDecimal(b.edge), amount: toOperatorDecimal(b.amount) }));
}
