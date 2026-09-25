/**
 * Whether a watched brand's selector can actually be swept, in the operator's words — or `null`.
 *
 * Checked on create and on edit, before the repository's own guard, for two reasons found
 * 2026-09-25: Hepsiburada's catalogue is read by search term only (api-references §2.13 — a
 * brand id cannot be honoured there), so a Hepsiburada brand saved with only an id was accepted
 * and could never be swept; and the repository's refusal reached the edit form in English.
 */
export function watchedBrandSelectorProblem(
  marketplaceCode: string,
  brandRef: string | null,
  searchTerm: string | null,
): string | null {
  if (!brandRef && !searchTerm) {
    return 'Marka id’si veya arama terimi gerekli — en az biri olmadan tarama yapılamaz.';
  }
  if (marketplaceCode === 'hepsiburada' && !searchTerm) {
    return 'Hepsiburada markaları arama terimiyle taranır; marka id’si orada kullanılamıyor. Bir arama terimi girin.';
  }
  return null;
}
