/**
 * A marketplace's display text as it should be stored: names of products, brands, sellers and
 * categories — never an id (2026-09-25).
 *
 * 153 of 8,214 stored product labels carried invisible characters or edge whitespace that day:
 * a left-to-right mark (U+200E) Hepsiburada prefixes to many names, non-breaking spaces, doubled
 * and trailing spaces. They sort a product away from its neighbours, defeat a search for the name
 * as typed, and survive into Excel exports. This removes the bidirectional-formatting controls,
 * turns every space-like character into a plain space, collapses runs and trims. Letters,
 * including Turkish ones, are untouched.
 *
 * Written with escapes only: an invisible character in source is exactly the trap this removes.
 */
const BIDI_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const SPACE_LIKE = /[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g;

export function cleanDisplayText(value: string): string {
  return value.replace(BIDI_CONTROLS, '').replace(SPACE_LIKE, ' ').trim();
}

/** `cleanDisplayText` for a payload field of unknown type; `null` when nothing is left. */
export function displayText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = cleanDisplayText(value);
  return cleaned === '' ? null : cleaned;
}

/**
 * Case-folds for comparison. Turkish lower-casing turns `I` into `ı`, which is right for Turkish
 * words and wrong for a foreign brand typed in capitals (`ORIJEN` → `orıjen`), so dotted and
 * dotless i are made the same letter here.
 */
function fold(text: string): string {
  return text.toLocaleLowerCase('tr').replace(/\u0131/g, 'i');
}

/**
 * Drops a brand name the text repeats at its start — "Orijen Orijen Kitten …" — which
 * Hepsiburada's catalogue produces when a seller's own title already begins with the brand it
 * prefixes (46 of 255 Hepsiburada labels on 2026-09-25).
 */
export function dropRepeatedBrand(name: string, brand: string | null): string {
  if (!brand) return name;
  const doubled = `${fold(brand)} ${fold(brand)} `;
  return fold(name).startsWith(doubled) ? name.slice(brand.length + 1) : name;
}
