/**
 * The rule that decides which marketplace credentials an operator action actually uses.
 *
 * The credential inputs on Settings > Marketplaces and in the setup wizard are write-only: they
 * render **empty** on a configured install, and the screen's own hint says a blank field keeps
 * its existing value. `/api/settings/marketplaces` has always merged that way when saving.
 * `/api/setup/marketplace/test` did not — it built an adapter straight from the posted object,
 * so pressing "Bağlantıyı Test Et" without retyping anything tested a set of empty strings. On
 * Trendyol that surfaced as
 *
 *     Trendyol API 404 on /product/sellers//products/approved?page=0&size=1
 *
 * — an empty `sellerId` collapsing into a double slash, reported as if the marketplace had
 * rejected us. Measured on a live install 2026-09-02.
 *
 * Kept here, as a pure function, because it is a decision branch two routes depend on and
 * neither route is reachable from a test (the licence gate answers 402, and the secret store is
 * a process global).
 */

/**
 * What the operator just typed, over what is already stored.
 *
 * Blank entries are **dropped, not merged**: a partially filled form must not blank a stored
 * field. That is the same rule the save route applies, and the two have to agree — a test that
 * passes against credentials a save would not have written is worse than no test.
 */
export function mergeCredentials(
  stored: Record<string, string>,
  posted: Record<string, string> | undefined,
): Record<string, string> {
  const entered = Object.entries(posted ?? {}).filter(([, value]) => value);
  return { ...stored, ...Object.fromEntries(entered) };
}

/** Turkish labels, so a "fill this in" message names the field the operator is looking at. */
const TRENDYOL_REQUIRED: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'apiKey', label: 'API Anahtarı' },
  { key: 'apiSecret', label: 'API Gizli Anahtarı' },
  { key: 'sellerId', label: 'Satıcı Kimliği (sellerId)' },
];

/**
 * The fields Trendyol needs and does not have, by their on-screen labels.
 *
 * Hepsiburada fails its own `HepsiburadaCredentialsSchema` when incomplete and gets a message
 * out of that. Trendyol has no schema, so without this an incomplete set reaches the API and
 * comes back as a bare HTTP status naming nothing the operator can act on.
 */
export function missingTrendyolCredentials(credentials: Record<string, string>): string[] {
  return TRENDYOL_REQUIRED.filter((field) => !credentials[field.key]).map((field) => field.label);
}
