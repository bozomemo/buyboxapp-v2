/**
 * The one way a stored `productUrl` becomes a link the browser can follow.
 *
 * What the database holds is whatever the source recorded: a pasted link is absolute
 * (`https://www.trendyol.com/marka/urun-p-757251065`), but a row discovered through a brand
 * catalogue sweep carries the path alone (`/marka/urun-p-757251065`). Handed to an `<a href>`
 * unchanged, the second kind resolves against the app's own origin and opens a 404 on
 * localhost instead of the marketplace — so the origin is supplied here, from the row's
 * marketplace code rather than from a hard-coded guess.
 */

const PUBLIC_ORIGINS: Record<string, string> = {
  trendyol: 'https://www.trendyol.com',
  hepsiburada: 'https://www.hepsiburada.com',
};

/**
 * An absolute marketplace URL, or `null` when the stored value cannot be made into one — an
 * empty path, or a marketplace with no origin recorded here. Callers render no link at all in
 * that case rather than one that goes nowhere.
 */
export function marketplaceProductUrl(
  marketplaceCode: string,
  productUrl: string | null | undefined,
): string | null {
  const stored = productUrl?.trim();
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored;

  const origin = PUBLIC_ORIGINS[marketplaceCode];
  if (!origin) return null;
  return `${origin}${stored.startsWith('/') ? '' : '/'}${stored}`;
}
