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
  SweepBrandCatalogue: 'Marka Kataloğu Taraması (raporlama)',
  ResolveProductBarcodes: 'Barkod Tamamlama (raporlama)',
  EvaluateBrandFindings: 'Denetim Bulguları (raporlama)',
};
