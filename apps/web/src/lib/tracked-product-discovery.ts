/**
 * How a tracked product came to be tracked, as one operator-facing phrase
 * (api-references §1.7).
 *
 * Shared between the grid and the CSV export deliberately. They had a copy each for about an
 * hour, and the two would have drifted the first time a selector was added — the export saying
 * one thing about a row and the screen another is the kind of disagreement nobody notices until
 * it is quoted in an argument with a seller.
 *
 * The four cases are genuinely different facts, not shades of one:
 *
 * - **marka id + arama** — the marketplace attributes it to the brand *and* it carries the name.
 *   The ordinary case.
 * - **marka id** — attributed to the brand but the search term missed it. Usually a naming
 *   quirk; occasionally a product whose title omits the brand entirely.
 * - **sadece arama** — carries the brand's name while the marketplace attributes it elsewhere.
 *   This is the brand-misuse shortlist, and the reason the two flags are stored separately.
 * - **elle eklendi** — no brand at all; an operator pasted a link.
 */
export interface DiscoverySource {
  readonly viaBrandRef?: boolean;
  readonly viaSearchTerm?: boolean;
  readonly watchedBrandId?: string | null;
}

export function discoveryLabel(row: DiscoverySource): string {
  if (row.viaBrandRef && row.viaSearchTerm) return 'marka id + arama';
  if (row.viaBrandRef) return 'marka id';
  if (row.viaSearchTerm) return 'sadece arama';
  // A brand-swept row with neither flag should not exist, but a row that predates the flags can
  // look like one. Attributing it to its brand is truer than calling it hand-added.
  return row.watchedBrandId ? 'marka taraması' : 'elle eklendi';
}

/**
 * True for a product carrying the brand's name that the marketplace does not attribute to the
 * brand — the row the audit wants flagged on screen.
 */
export function isBrandNameOnly(row: DiscoverySource): boolean {
  return row.viaSearchTerm === true && row.viaBrandRef !== true;
}
