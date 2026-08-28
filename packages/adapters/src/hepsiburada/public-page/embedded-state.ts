/**
 * Extracts the two embedded states Hepsiburada's server-rendered pages carry
 * (api-references §2.13/§2.14, measured 2026-08-28).
 *
 * Hepsiburada renders both the search results and the product page on the server and ships the
 * data that produced them inside the HTML. There are two different containers, and which one
 * carries what is not a preference — it is what the pages actually do:
 *
 * | Page | Container | Carries |
 * |---|---|---|
 * | `/ara?q=…` | `window.MORIA.PRODUCTLIST`, a JS object whose `'STATE'` value is JSON **inside a string literal** | the product cards |
 * | product page | `<script type="mime/invalid" id="reduxStore">`, plain JSON | `productState.product`, including the barcode |
 *
 * The search page also has a `reduxStore`, but its `searchState.searchProductArray` is empty and
 * `totalSearchProductCount` is `0` there (measured 2026-08-28) — the cards live only in the
 * MORIA blob. Reading the obvious-looking container would report every brand as having no
 * products, so the two extractors are separate and each is named for the page it belongs to.
 *
 * ## The double escaping, handled once
 *
 * The catalogue's JSON is not embedded as JSON: it is embedded as the *text of a JavaScript
 * string literal*, so every `"` arrives as `\"` and a real backslash as `\\`. Decoding and
 * finding the end of the object are the same pass here, because they cannot be separated
 * safely: a brace inside a string value is not a brace, and you only know you are inside a
 * string once the JS layer has been decoded. Doing it in two passes — unescape, then brace-count
 * — is the version that works on today's payload and silently truncates on the day a product
 * name contains a brace.
 */

export class HepsiburadaStateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HepsiburadaStateNotFoundError';
  }
}

/** The marker the search page's card payload hangs off. */
export const MORIA_PRODUCT_LIST_MARKER = 'window.MORIA.PRODUCTLIST';

/** The product page's plain-JSON container. */
const REDUX_STORE_OPEN = /<script[^>]*id="reduxStore"[^>]*>/;

/**
 * Decodes a JavaScript string literal's body starting at `start`, stopping at the `}` that
 * closes the first `{` — reading the JS escape layer and the JSON string layer in one pass, so
 * that a `{` inside a product name is never mistaken for structure.
 */
function decodeUntilBalanced(source: string, start: number): string {
  let out = '';
  let depth = 0;
  let started = false;
  let inString = false;
  let jsonEscape = false;
  let i = start;

  while (i < source.length) {
    let ch = source[i]!;
    if (ch === '\\') {
      const next = source[i + 1];
      if (next === undefined) break;
      i += 2;
      if (next === 'n') ch = '\n';
      else if (next === 't') ch = '\t';
      else if (next === 'r') ch = '\r';
      else if (next === 'u') {
        const code = Number.parseInt(source.slice(i, i + 4), 16);
        if (!Number.isFinite(code)) break;
        ch = String.fromCharCode(code);
        i += 4;
      } else {
        // `\"` becomes `"` and `\\` becomes `\`; both are then judged on the JSON layer below.
        ch = next;
      }
    } else {
      i += 1;
    }

    out += ch;

    if (jsonEscape) {
      jsonEscape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') jsonEscape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === '}') {
      depth -= 1;
      if (started && depth === 0) return out;
    }
  }

  throw new HepsiburadaStateNotFoundError(
    'Hepsiburada embedded state ended before its closing brace — the page was truncated or the container changed',
  );
}

/**
 * Returns the search page's product-list state.
 *
 * @throws {HepsiburadaStateNotFoundError} when the marker is gone, which is what a frontend
 * change looks like from here — a named failure, never an empty catalogue.
 */
export function extractMoriaProductListState(html: string): unknown {
  const markerAt = html.indexOf(MORIA_PRODUCT_LIST_MARKER);
  if (markerAt < 0) {
    throw new HepsiburadaStateNotFoundError(
      `Hepsiburada search page carried no ${MORIA_PRODUCT_LIST_MARKER} marker`,
    );
  }
  const stateAt = html.indexOf("'STATE'", markerAt);
  if (stateAt < 0) {
    throw new HepsiburadaStateNotFoundError(
      `Hepsiburada ${MORIA_PRODUCT_LIST_MARKER} carried no STATE entry`,
    );
  }
  const objectAt = html.indexOf('{', stateAt);
  if (objectAt < 0) {
    throw new HepsiburadaStateNotFoundError('Hepsiburada STATE entry carried no object');
  }

  const json = decodeUntilBalanced(html, objectAt);
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new HepsiburadaStateNotFoundError(
      `Hepsiburada product list state did not parse as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Returns the product page's redux store. Plain JSON, no string-literal layer — the
 * `type="mime/invalid"` is how the page stops the browser executing it.
 */
export function extractReduxStoreState(html: string): unknown {
  const open = REDUX_STORE_OPEN.exec(html);
  if (!open) {
    throw new HepsiburadaStateNotFoundError('Hepsiburada product page carried no reduxStore script');
  }
  const from = open.index + open[0].length;
  const close = html.indexOf('</script>', from);
  if (close < 0) {
    throw new HepsiburadaStateNotFoundError('Hepsiburada reduxStore script was never closed');
  }
  try {
    return JSON.parse(html.slice(from, close).trim());
  } catch (error) {
    throw new HepsiburadaStateNotFoundError(
      `Hepsiburada reduxStore did not parse as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
