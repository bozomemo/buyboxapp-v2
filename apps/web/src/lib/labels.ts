/**
 * Turkish labels for the domain enums that reach the screen (R-UI-11: the interface language is
 * Turkish).
 *
 * Shared rather than per screen because the same enum was already being spelled two ways: the
 * listing detail translated `state` and `reason`, the dashboard printed the raw database value
 * (`queued`, `confirmed`) beside it, and an operator comparing the two screens saw two different
 * vocabularies for one fact. The core's `explanation` string is English by construction
 * (`packages/core/src/repricing/engine.ts` builds it for the log), so a decision is labelled from
 * its `reason` enum here and keeps the raw explanation only as supporting detail.
 *
 * Every map is looked up with a fallback to the raw value: a reason or state this build does not
 * know about is a missing translation, not a reason to render nothing.
 */

/** `packages/core` `RepricingPhase`. */
export const PHASE_LABELS: Record<string, string> = {
  SEEKING: 'Arıyor',
  CLIMBING: 'Tırmanıyor',
  REFINING: 'İnceltiyor',
  OPTIMUM: 'Optimum',
  BLOCKED: 'Bloke',
};

/** One line each, for the phase tiles — what the phase means for this listing right now. */
export const PHASE_DESCRIPTIONS: Record<string, string> = {
  SEEKING: 'Buybox’ı almak için fiyat düşürülüyor.',
  CLIMBING: 'Buybox elde tutulurken kâr için fiyat yükseltiliyor.',
  REFINING: 'En kârlı noktaya ince ayar yapılıyor.',
  OPTIMUM: 'En kârlı fiyatta duruyor — yapılacak bir şey yok.',
  BLOCKED: 'Kârlı bir fiyat mümkün değil; fiyat değiştirilmiyor.',
};

/** `price_submissions.state` — queued|submitted|confirmed|failed|rejected|cancelled. */
export const SUBMISSION_STATE_LABELS: Record<string, string> = {
  queued: 'Kuyrukta',
  submitted: 'Gönderildi',
  confirmed: 'Onaylandı',
  failed: 'Başarısız',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
};

/**
 * `packages/core` `DecisionReason`, plus `manual` for an operator-entered price.
 *
 * Phrased as *what happened to the price*, not as the engine's internal state name: the
 * operator's question at a decision row is "why did it move (or not)?".
 */
export const DECISION_REASON_LABELS: Record<string, string> = {
  manual: 'Elle değiştirildi',
  SellingAtLoss: 'Zararına satılıyordu — taban fiyata çekildi',
  Seeking: 'Buybox için fiyat düşürüldü',
  Climbing: 'Buybox elde, kâr için yükseltildi',
  Refining: 'İnce ayar',
  HoldingOptimum: 'En iyi fiyatta tutuluyor',
  Blocked: 'Piyasa taban fiyatımızın altında — beklemede',
  SoleSeller: 'Tek satıcı — hedef kâra göre fiyatlandı',
  NothingChanged: 'Değişiklik gerekmedi',
  AwaitingConfirmation: 'Önceki gönderimin onayı bekleniyor',
  AwaitingSettle: 'Piyasanın oturması bekleniyor',
  Disabled: 'Bu ilan için fiyatlama kapalı',
  InsufficientData: 'Yeterli buybox verisi yok',
  BudgetExhausted: 'Günlük güncelleme bütçesi doldu',
  CostUnknown: 'Maliyet hesaplanamadı',
  PriceRangeRejected: 'Pazaryerinin izin verdiği aralık dışında',
  AtConfiguredLimit: 'Ayarlanan üst sınır taban fiyatın altında',
};

export function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—';
  return map[key] ?? key;
}

/**
 * `/alerts`' rule builder. Moved from `alerts-client.tsx` (doc 15 §1b) — an alert rule's scope,
 * subject, predicate and threshold are domain vocabulary the operator reads on every screen that
 * ever shows a rule, not something specific to the alerts screen.
 */
export const SCOPE_LABELS: Record<string, string> = {
  all: 'Tüm ürünler',
  marketplace: 'Bir pazaryerindeki tüm ürünler',
  listing: 'Tek bir ilan',
  baseStockCode: 'Bir stok kodundaki tüm ilanlar',
};

export const SUBJECT_LABELS: Record<string, string> = {
  any: 'Herhangi bir satıcı',
  seller: 'Belirli bir satıcı',
  sellerGroup: 'Bir satıcı grubu',
};

export const PREDICATE_LABELS: Record<string, string> = {
  sellerPresent: 'ilanda görünürse',
  priceBelow: 'şu eşiğin altında fiyat verirse',
};

export const THRESHOLD_LABELS: Record<string, string> = {
  fixed: 'Sabit fiyat',
  belowOurPrice: 'Bizim fiyatımız',
  belowFloor: 'Taban fiyatımız',
  pctBelowOurs: 'Bizim fiyatımızdan yüzde aşağısı',
};

/**
 * `app_events.level`. Moved from `events-client.tsx` (doc 15 §1b). `debug` is left mapped to the
 * English word it already was — a pre-existing translation gap the baseline recorded, not fixed
 * here; Phase 4.6 owns that screen's consistency pass.
 */
export const LEVEL_LABELS: Record<string, string> = {
  debug: 'debug',
  info: 'bilgi',
  warn: 'uyarı',
  error: 'hata',
};

/** `/jobs`' per-marketplace circuit breaker state. Moved from `jobs-client.tsx` (doc 15 §1b). */
export const CIRCUIT_LABELS: Record<string, string> = {
  closed: 'Kapalı (normal)',
  open: 'Açık (devre dışı)',
  'half-open': 'Yarı açık (deneme)',
};

/**
 * `job_runs.state` — running|success|failed (`packages/db` `repositories/jobs.ts`). Added during
 * `/jobs`' Phase 2.1 rework (doc 15 §6, 2.1): the catalogue's "Son Çalışma" column and the run
 * history table both printed this raw (R-UI-11), which the plan's baseline recorded as a known
 * issue ("raw run `state`").
 */
export const JOB_RUN_STATE_LABELS: Record<string, string> = {
  running: 'Çalışıyor',
  success: 'Başarılı',
  failed: 'Başarısız',
};

/**
 * A tracked (rival) product's last scrape outcome. Moved from
 * `tracked-product-detail-client.tsx` (doc 15 §1b). `noOffers` is phrased as a fact about the
 * market, not a failure of the scrape: the page was read fine and nobody was selling.
 */
export const STATUS_LABELS: Record<string, string> = {
  ok: 'Başarılı',
  noOffers: 'Satıcı yok',
  parseFailed: 'Sayfa okunamadı',
  fetchFailed: 'Sayfaya ulaşılamadı',
};

/** Marketplace codes. Moved from `cross-marketplace-client.tsx` (doc 15 §1b). */
export const MARKETPLACE_LABELS: Record<string, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
};

/**
 * `packages/jobs` `JOB_CATALOG` identifiers (`ImportListings`, `ObserveBuybox`, …), for the spots
 * that carry only the raw `jobName` and not the catalogue's own joined `label` — `/jobs`' claimed
 * jobs list and its run-history rows (doc 15 §1b: "`/jobs` currently shows raw JOB_CATALOG
 * identifiers"). Kept in sync with `packages/jobs/src/job-catalog.ts` by hand; wiring this into
 * those two spots is `/jobs`' own Phase 2 rework (doc 15 §6, 2.1), not done here — Phase 1 moves
 * vocabulary, it does not change what a screen renders.
 */
/**
 * `packages/core` `AuditFindingKind` — `/watched-brands/findings`' finding types. Was a local
 * `KIND_LABEL` in `findings-client.tsx` (doc 15 §6, Phase 2.4); moved here per §2 rule 10 (no
 * local `*_LABELS` map).
 */
export const FINDING_KIND_LABELS: Record<string, string> = {
  blockedSellerPresent: 'Yasaklı satıcı satışta',
  belowReferencePrice: 'Tavsiye fiyatın altında',
  notOnAuthorisedList: 'Yetkili listesinde yok',
  deepDiscountOnOneProduct: 'Tek üründe derin indirim',
  persistentUndercut: 'Sistematik fiyat kırma',
  belowMarketAverage: 'Piyasa altı ortalama',
  newSeller: 'Yeni görülen satıcı',
  unrelatedCategory: 'Alakasız kategori',
  brandRefDisagreement: 'Marka eşleşmesi uyuşmuyor',
};

/**
 * `AuditFindingBasis` — whether a finding rests on a record the operator wrote themselves
 * (`stated`) or is inferred from observed prices (`measured`). Was a local `BASIS_LABEL` in
 * `findings-client.tsx`; moved here per §2 rule 10.
 */
export const FINDING_BASIS_LABELS: Record<string, string> = {
  stated: 'Kesin bilgi',
  measured: 'Yorum',
};

/**
 * `sellerPoliciesRepo.SellerPolicyStatus` plus the resolver's third state (`undefined` — no rule
 * applies). Was a local `VERDICT_LABEL` in `policy-client.tsx` (doc 15 §6, Phase 3.2); moved here
 * per §2 rule 10 (no local `*_LABELS` map).
 *
 * `undefined` is a real state, not a fallback: it is the state almost every seller is in, and it
 * means "nobody has looked at this seller yet", not "unauthorised" (doc 06 §12.4, Faz 5).
 */
export const POLICY_VERDICT_LABELS: Record<string, string> = {
  authorised: 'Yetkili',
  blocked: 'Yasaklı',
  undefined: 'Tanımsız',
};

export const JOB_LABELS: Record<string, string> = {
  ImportListings: 'İlan İçe Aktarma',
  ObserveBuybox: 'Buybox Gözlemi',
  Reprice: 'Yeniden Fiyatlandırma',
  SubmitPriceChanges: 'Fiyat Gönderimi',
  ConfirmSubmissions: 'Gönderim Onayı',
  ResetBudget: 'Bütçe Sıfırlama',
  ImportStockItems: 'Stok İçe Aktarma',
  PruneHistory: 'Geçmiş Temizliği',
  ImportBundles: 'Paket İçe Aktarma',
  ScrapeCompetitors: 'Rakip Verisi Toplama (raporlama)',
  SweepTrackedProducts: 'Takip Ürün Turu (raporlama)',
  SweepListedProducts: 'İlanlar Turu (raporlama)',
  SweepBrandCatalogue: 'Marka Kataloğu Taraması (raporlama)',
  ScrapeBrandSellers: 'Marka Satıcı Taraması (raporlama)',
  RescanTrackedProducts: 'Seçili Ürün Taraması (raporlama)',
  ResolveProductBarcodes: 'Barkod Tamamlama (raporlama)',
  EvaluateBrandFindings: 'Denetim Bulguları (raporlama)',
  ResolveSellerIdentity: 'Satıcı Kimliği Çözümleme (raporlama)',
};

/**
 * The brand import's row problems, in the words an operator can act on (doc 17 §3.5).
 *
 * Each message names the column and what to do, because the operator is about to fix a
 * spreadsheet: "PSF okunamadı" sends them to the right cell, "geçersiz satır" does not. The
 * column errors that name another product interpolate it — see `importErrorMessage`.
 */
export const IMPORT_ERROR_LABELS: Record<string, string> = {
  missingName: 'Ürün adı boş.',
  missingReferencePrice: 'PSF boş. Her ürünün bir PSF’si olmalı.',
  unparseableReferencePrice: 'PSF okunamadı. Örnek: 1.249,90',
  unparseableMinPrice: 'Min fiyat okunamadı. Örnek: 999,90',
  unparseableMaxPrice: 'Max fiyat okunamadı. Örnek: 1.499,90',
  nonPositiveAmount: 'Fiyatlar sıfırdan büyük olmalı.',
  amountTooLarge: 'Fiyat çok büyük — en fazla 100.000.000 ₺ girilebilir.',
  minAboveUpper: 'Min fiyat üst sınırın üstünde — hiçbir fiyat aralıkta kalmaz.',
  noLink: 'En az bir link gerekli: Trendyol ya da Hepsiburada.',
  linkUnrecognised: 'Link tanınamadı. Ürün sayfasının linkini yapıştırın.',
  linkWrongColumn: 'Link yanlış sütunda — bu pazaryerine ait değil.',
  linkParentProduct:
    'Bu link ürün ailesini gösteriyor, satılan varyantı değil. Varyantı açıp linkini kopyalayın.',
  linkIsSecondaryCard: 'Bu kart başka bir ürüne ek kart olarak bağlı.',
  conflictingProducts: 'İki link iki ayrı ürüne ait — hangisi olduğu dosyadan anlaşılmıyor.',
  duplicateLinkInFile: 'Aynı link dosyada birden fazla satırda var.',
  marketplaceNotConfigured: 'Bu pazaryeri kurulumda tanımlı değil. Ayarlar > Pazaryerleri.',
  barcodeScientific:
    'Barkod Excel’de bilimsel gösterime dönmüş (ör. 8.69E+12), rakamları kaybolmuş. Barkod sütununu Metin biçimine çevirip barkodu yeniden yazın.',
};

export const IMPORT_WARNING_LABELS: Record<string, string> = {
  referenceBelowMin: 'PSF, min fiyatın altında.',
  referenceAboveMax: 'PSF, max fiyatın üstünde.',
  duplicateName: 'Bu adı taşıyan başka bir ürün daha var.',
  barcodeNotGtin: 'Barkod geçerli bir EAN/GTIN değil; pazaryeri kartlarıyla eşleşmez.',
};

export const IMPORT_COLUMN_LABELS: Record<string, string> = {
  name: 'Ürün Adı',
  referencePrice: 'PSF',
  minPrice: 'Min Fiyat',
  maxPrice: 'Max Fiyat',
  trendyolLink: 'Trendyol Linki',
  hepsiburadaLink: 'Hepsiburada Linki',
  barcode: 'Barkod',
};

/** The message for one row problem, with the other product named where there is one. */
export function importErrorMessage(error: {
  code: string;
  column?: string;
  otherProductName?: string;
}): string {
  const base = IMPORT_ERROR_LABELS[error.code] ?? error.code;
  if (!error.otherProductName) return base;
  return error.code === 'linkIsSecondaryCard'
    ? `Bu kart "${error.otherProductName}" ürününe ek kart olarak bağlı.`
    : `${base} (${error.otherProductName})`;
}
