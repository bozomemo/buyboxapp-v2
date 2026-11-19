/**
 * A marketplace connection test's failure, said so the operator knows what to fix.
 *
 * The adapters fail with a developer's message — "Trendyol API 403 on
 * /product/sellers/123456/products/approved?page=0&size=1" — and the test buttons used to show it
 * as it was (2026-11-19 walkthrough). The HTTP status stays in the sentence so support can still
 * tell the cases apart; the path does not.
 */
type MarketplaceCode = 'trendyol' | 'hepsiburada';

const NAME: Record<MarketplaceCode, string> = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' };
/** Turkish suffix for "to Trendyol" / "to Hepsiburada" (vowel harmony on the last vowel). */
const DATIVE: Record<MarketplaceCode, string> = { trendyol: "Trendyol'a", hepsiburada: "Hepsiburada'ya" };
const LOGIN_FIELDS: Record<MarketplaceCode, string> = {
  trendyol: 'API Anahtarı, API Gizli Anahtarı ve Satıcı Kimliği',
  hepsiburada: 'Mağaza Kullanıcı Adı, Şifre ve Merchant ID',
};

const HEPSIBURADA_LABELS: Record<string, string> = {
  merchantId: 'Merchant ID',
  username: 'Mağaza Kullanıcı Adı',
  password: 'Şifre',
};

export function hepsiburadaFieldLabel(key: string): string {
  return HEPSIBURADA_LABELS[key] ?? key;
}

const NETWORK = /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|timeout|aborted/i;

export function describeConnectionFailure(code: MarketplaceCode, raw: string): string {
  const name = NAME[code];
  const status = / API (\d{3}) on /.exec(raw)?.[1];
  if (status !== undefined) {
    const http = `(HTTP ${status})`;
    const n = Number(status);
    if (n === 401 || n === 403) {
      return `${name} bilgileri kabul etmedi ${http}. ${LOGIN_FIELDS[code]} alanlarını kontrol edin; Ortam olarak Test seçiliyse bilgilerin test ortamına ait olması gerekir.`;
    }
    if (n === 404) return `${name} tarafında istenen kayıt bulunamadı ${http}. Mağaza kimliğini kontrol edin.`;
    if (n === 429) return `Çok fazla istek ${http}. ${name} bir süre bekletiyor; birkaç dakika sonra yeniden deneyin.`;
    if (n >= 500) return `${name} şu anda yanıt vermiyor ${http}. Biraz sonra yeniden deneyin.`;
    return `${name} isteği kabul etmedi ${http}.`;
  }
  if (NETWORK.test(raw)) {
    return `${DATIVE[code]} bağlanılamadı. Sunucunun internet bağlantısını kontrol edin ve biraz sonra yeniden deneyin.`;
  }
  return raw;
}
