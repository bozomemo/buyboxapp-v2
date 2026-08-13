/**
 * Extracts Trendyol's serialised application state from a product page's initial HTML
 * (guide §1, §2 — `docs/trendyol-merchants-scraping-guide.md`).
 *
 * The rules that matter, and why:
 *
 * - **Find the script by its marker, never by index or DOM position** (guide §2). The legacy
 *   system took `/html/body/script[1]` and broke whenever Trendyol inserted a script
 *   (doc 04 §1.5, doc 09 §22).
 * - **Balanced-brace parsing, not a regex** (guide §2). The legacy system cut the substring
 *   from `{"product"` to the first `}};`, which silently truncates the moment a nested object
 *   happens to end that way. Braces inside JSON strings must not be counted, and `\"` inside
 *   a string must not end it.
 * - No DOM parser and no browser: the payload is in the initial HTML response (guide §1).
 */

export const SHARED_PROPS_MARKER = '__envoy__SHARED_PROPS';

export class SharedPropsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharedPropsNotFoundError';
  }
}

/**
 * Reads a balanced `{...}` object starting at `start`, honouring JSON string literals and
 * backslash escapes. Returns the object's source text, or `null` if it never closes.
 */
export function readBalancedObject(source: string, start: number): string | null {
  if (source[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i += 1) {
    const char = source[i]!;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Reads a single- or double-quoted JS string literal starting at `start` and returns its
 * *decoded* contents. Covers the `= JSON.parse("{\"product\":…}")` shape, which some Trendyol
 * page variants use instead of a bare object literal.
 */
function readQuotedLiteral(source: string, start: number): string | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return null;
  let escaped = false;
  for (let i = start + 1; i < source.length; i += 1) {
    const char = source[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === quote) {
      const raw = source.slice(start, i + 1);
      // A JS string literal's escape grammar is JSON's, once the quoting is normalised.
      const asJson = quote === '"' ? raw : `"${raw.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`;
      try {
        return JSON.parse(asJson) as string;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Every `<script>` body in the document, in order. No DOM parser — the payload is inline text. */
export function extractScriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const openTag = /<script\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = openTag.exec(html)) !== null) {
    const bodyStart = match.index + match[0].length;
    const closeIndex = html.indexOf('</script', bodyStart);
    if (closeIndex === -1) break;
    bodies.push(html.slice(bodyStart, closeIndex));
    openTag.lastIndex = closeIndex;
  }
  return bodies;
}

/**
 * Locates the `__envoy__SHARED_PROPS` assignment in a product page's HTML and returns the
 * deserialised state object.
 *
 * @throws {SharedPropsNotFoundError} when the marker, the assignment or valid JSON is absent —
 * the caller turns this into `scrape_runs.status = 'parseFailed'` (doc 05 §5), never a retry
 * storm and never a pricing-path failure.
 */
export function extractSharedProps(html: string): unknown {
  const script = extractScriptBodies(html).find((body) => body.includes(SHARED_PROPS_MARKER));
  if (script === undefined) {
    throw new SharedPropsNotFoundError(`No <script> containing ${SHARED_PROPS_MARKER}`);
  }

  const markerIndex = script.indexOf(SHARED_PROPS_MARKER);
  const equalsIndex = script.indexOf('=', markerIndex);
  if (equalsIndex === -1) {
    throw new SharedPropsNotFoundError(`${SHARED_PROPS_MARKER} found but never assigned`);
  }

  // Skip whitespace and any `JSON.parse(` wrapper to reach the value itself.
  let cursor = equalsIndex + 1;
  const skipWhitespace = () => {
    while (cursor < script.length && /\s/.test(script[cursor]!)) cursor += 1;
  };
  skipWhitespace();
  if (script.startsWith('JSON.parse', cursor)) {
    cursor = script.indexOf('(', cursor) + 1;
    skipWhitespace();
  }

  const literal = readQuotedLiteral(script, cursor);
  const objectSource = literal ?? readBalancedObject(script, cursor);
  if (objectSource === null) {
    throw new SharedPropsNotFoundError(`${SHARED_PROPS_MARKER} assignment is not a balanced object`);
  }

  try {
    return JSON.parse(objectSource);
  } catch (error) {
    throw new SharedPropsNotFoundError(
      `${SHARED_PROPS_MARKER} payload is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
