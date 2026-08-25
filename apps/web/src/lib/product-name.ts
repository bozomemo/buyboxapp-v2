/**
 * The one way a product is named on screen: `Marka - Ürün Adı` (customer feedback 2026-08-25).
 *
 * The marketplaces store the brand apart from the title, and their titles are inconsistent about
 * repeating it — some lead with it, most do not. Composing here rather than at each of the ten
 * screens that show a product means the operator sees one shape everywhere, including in the CSV
 * exports.
 */

/**
 * Does the title open with its own brand, whatever case either was written in?
 *
 * Both foldings are tried because the catalogue holds both kinds of word and they disagree on
 * exactly the letter that matters. Turkish folding is right for Turkish brands (`İZMİR` and
 * `İzmir` are one word; so are `ILIK` and `ılık`) but maps `I`→`ı`, so under it alone the very
 * common all-caps marketplace title `WHISKAS …` does not match the brand `Whiskas` and the
 * label comes out `Whiskas - WHISKAS …`. Invariant folding is right for that one and wrong for
 * the Turkish pair. Either matching is enough: a false match would need a title whose opening
 * word differs from the brand *only* by dotted-vs-dotless I, and prefixing such a title twice
 * is the worse outcome than trimming it once.
 */
function startsWithBrand(name: string, brand: string): boolean {
  return (
    name.toLocaleLowerCase('tr').startsWith(brand.toLocaleLowerCase('tr')) ||
    name.toLowerCase().startsWith(brand.toLowerCase())
  );
}

/**
 * `Marka - Ürün Adı`, given the listing's product name and its brand name (null on any listing
 * with no brand recorded — every Hepsiburada row today, doc 06 §12.1, which then shows the bare
 * product name unchanged).
 *
 * A title that already opens with its own brand is not prefixed a second time; its leading brand
 * and whatever separator follows are lifted into the prefix instead, so
 * `Whiskas Sığır Etli Mama` and `Sığır Etli Mama` both render as `Whiskas - Sığır Etli Mama`.
 */
export function withBrand(productName: string, brandName?: string | null): string {
  const name = productName.trim();
  const brand = brandName?.trim();
  if (!brand) return name;
  if (!name) return brand;

  let rest = name;
  if (startsWithBrand(name, brand)) {
    // Drop the repeated brand and any separator the title used between it and the rest
    // (`Whiskas - Mama`, `Whiskas: Mama`, `Whiskas Mama` all leave `Mama`).
    rest = name.slice(brand.length).replace(/^[\s\-–—:|,]+/u, '');
  }
  // `rest` is empty when the title *is* the brand — naming it `Whiskas - ` would be worse.
  return rest ? `${brand} - ${rest}` : brand;
}
