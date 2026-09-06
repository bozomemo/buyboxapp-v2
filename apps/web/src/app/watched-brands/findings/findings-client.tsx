'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ago, EmptyState, ErrorState, LoadingState, PageHeader, Section, TONE_BOX } from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { FINDING_BASIS_LABELS, FINDING_KIND_LABELS, labelOf } from '@/lib/labels';
import { marketplaceProductUrl } from '@/lib/product-url';

/**
 * Denetim bulguları (doc 06 §12.4, Faz 6; IA reworked doc 15 §6, Phase 2.4).
 *
 * Faz 4 markayı kimin sattığını, Faz 5 kimin satması gerektiğini söyler. Bu ekran **bakılmaya
 * değer olanı** söyler ve bunu iki farklı güvenle söyler:
 *
 * - **Kesin bilgi** — operatörün kendi yazdığı bir kayda dayanır. "Yasaklı satıcı bu markayı
 *   satıyor" bir yorum değil: kuralı biri yazdı, satıcı da sayfada.
 * - **Yorum** — gözlenen fiyatlardan çıkarılır. "Piyasanın %22 altında" bir örneklem yorumudur;
 *   döneme, o an sayfada kimin bulunduğuna ve birinin seçtiği bir eşiğe göre değişir.
 *
 * Sıralama bu ayrımdan çıkar, önem tablosundan değil (`packages/core/src/brand/audit-findings.ts`
 * `KIND_ORDER`): kesin bilgi, sayısı ne kadar çarpıcı olursa olsun yorumun üstündedir. Karar
 * mantığının tamamı `packages/core` içinde saf ve tablo-testlidir; bu dosya yalnızca gösterir.
 * 2026-09-06'daki geçişten önce bu ayrım listede yalnızca küçük bir rozetle taşınıyordu — sıra
 * doğruydu ama görsel olarak gizliydi. Liste artık zaten var olan bu sırayı iki başlıklı gruba
 * (`FindingGroup`) çevirerek görünür kılıyor; sunucudaki sıralamayı değiştirmiyor.
 *
 * ⚠️ Hiçbir satır bir ihlal iddiası değildir. Bulgu "şuraya bak" der; ihtarı insan gönderir.
 */

type FindingKind =
  | 'blockedSellerPresent'
  | 'belowReferencePrice'
  | 'notOnAuthorisedList'
  | 'deepDiscountOnOneProduct'
  | 'persistentUndercut'
  | 'belowMarketAverage'
  | 'newSeller'
  | 'unrelatedCategory'
  | 'brandRefDisagreement';

type FindingBasis = 'stated' | 'measured';

type Subject =
  | { kind: 'seller'; marketplaceCode: string; sellerRef: string; name: string }
  | { kind: 'product'; trackedProductId: string; label: string };

interface Finding {
  id: string;
  kind: FindingKind;
  basis: FindingBasis;
  subject: Subject;
  thresholdKey: string | null;
  magnitude: number;
  productCount?: number;
  observationCount?: number;
  lastSeenAt?: number;
  note?: string | null;
  deviationPct?: number;
  otherDeviationPct?: number;
  productLabel?: string;
  sellerName?: string;
  sellerRef?: string;
  sharePct?: number;
  firstSeenAt?: number;
  daysAgo?: number;
  categoryName?: string;
  categoryProductCount?: number;
  /** Kuruş, dizge olarak — para her zaman bigint, asla float (CLAUDE.md). */
  referencePrice?: string;
  lowestPrice?: string;
  shortfallPct?: number;
  looksBelow?: number;
  lastBelowAt?: number;
  marketplaceCode?: string;
  /**
   * `EvaluateBrandFindings`'ın bu bulguyu **ilk açtığı** an, ve bildirimin gönderildiği an.
   * `firstSeenAt` değil: o ad bu nesnede zaten `newSeller` bulgusunun "satıcının ilk görülmesi"
   * için kullanılıyor ve aynı adın altındaki iki farklı tarih, ekranı hata vermeden yanlış
   * çizdiren türden bir karışıklıktır.
   * İkisi de `null` olabilir: bulgular bu ekranda her seferinde yeniden hesaplandığı için,
   * operatör iş henüz değerlendirmeden önce gelmiş olabilir. O zaman tarih gösterilmez —
   * bugünün tarihi gösterilmez.
   */
  openedAt?: number | null;
  notifiedAt?: number | null;
}

interface Thresholds {
  belowMarketPct: number;
  deepDiscountPct: number;
  deepDiscountContrastPct: number;
  undercutSharePct: number;
  undercutMinProducts: number;
  newSellerDays: number;
  minObservations: number;
  referenceBelowPct: number;
  unrelatedCategoryMaxSharePct: number;
  unrelatedCategoryMaxProducts: number;
}

interface Report {
  groups: { id: string; name: string }[];
  brands: { id: string; groupId: string; label: string; marketplaceCode: string }[];
  brand: { id: string; label: string; marketplaceCode: string } | null;
  thresholds: Thresholds;
  thresholdsAreDefault: boolean;
  needsBrand: boolean;
  findings: Finding[];
  /** Yeni bulgunun itileceği bir yer yapılandırılmış mı. Adresin kendisi asla gönderilmez. */
  notificationsConfigured?: boolean;
  filters?: { sinceMs: number; untilMs: number };
  context?: {
    hasAuthorisedList: boolean;
    sellerCount: number;
    productCount: number;
    truncatedDeviations: boolean;
    truncatedDisagreements: boolean;
    disagreementTotal: number;
    referencePrice?: {
      productsWithPrice: number;
      productsTotal: number;
      truncated: boolean;
    };
  };
}

interface EvidenceOffer {
  sellerRef: string | null;
  sellerName: string | null;
  rank: number | null;
  price: string | null;
  finalPrice: string | null;
  offeredStock: number | null;
}

interface EvidenceLook {
  trackedProductId: string;
  productLabel: string;
  productUrl: string;
  marketplaceCode: string;
  observedAt: number;
  offers: EvidenceOffer[];
}

/** Her eşik için ekranda görünen ad ve birimi. Sıra, ekrandaki panelin sırasıdır. */
const THRESHOLD_FIELDS: { key: keyof Thresholds; label: string; unit: string; help: string }[] = [
  {
    key: 'belowMarketPct',
    label: 'Piyasa altı sapma',
    unit: '%',
    help: 'Satıcının ortalaması piyasanın bu kadar altındaysa bulgu.',
  },
  {
    key: 'deepDiscountPct',
    label: 'Derin indirim',
    unit: '%',
    help: 'Tek bir üründe bu kadar altta olmak tek başına bulgudur.',
  },
  {
    key: 'deepDiscountContrastPct',
    label: 'Derin indirim karşıtlığı',
    unit: '%',
    help: 'Ama satıcının diğer ürünleri piyasaya bu kadar yakınsa — yoksa zaten ucuz bir satıcıdır.',
  },
  {
    key: 'undercutSharePct',
    label: 'En ucuz olma oranı',
    unit: '%',
    help: 'Kendi tekliflerinin bu kadarında en ucuzsa sistematik sayılır.',
  },
  {
    key: 'undercutMinProducts',
    label: 'En az ürün',
    unit: 'ürün',
    help: 'Tek üründeki fiyat savaşı bir örüntü değildir.',
  },
  {
    key: 'newSellerDays',
    label: 'Yeni satıcı',
    unit: 'gün',
    help: 'İlk kez bu kadar gün içinde görülen satıcı yenidir.',
  },
  {
    key: 'minObservations',
    label: 'En az gözlem',
    unit: 'gözlem',
    help: 'Bunun altında hiçbir yorum bulgusu üretilmez. Kesin bilgi bulguları bundan etkilenmez.',
  },
  {
    key: 'referenceBelowPct',
    label: 'Tavsiye fiyat toleransı',
    unit: '%',
    help: 'Yayımladığınız fiyatın bu kadar altına inen satıcı bulgudur. Sıfır değil: liste fiyatı liraya yuvarlıdır, pazaryeri fiyatı kuruşla oynar.',
  },
  {
    key: 'unrelatedCategoryMaxSharePct',
    label: 'Seyrek kategori payı',
    unit: '%',
    help: 'Markanın ürünlerinin en fazla bu kadarını barındıran kategori olağandışıdır.',
  },
  {
    key: 'unrelatedCategoryMaxProducts',
    label: 'Seyrek kategori ürün sayısı',
    unit: 'ürün',
    help: 'Ve en fazla bu kadar ürün — büyük bir katalogda pay tek başına yeterli değil.',
  },
];

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

/** Bulgunun tek cümlelik gövdesi. Sayılar burada, çünkü her tür farklı sayı taşır. */
function describe(f: Finding): React.ReactNode {
  switch (f.kind) {
    case 'blockedSellerPresent':
      return (
        <>
          Bu satıcı bu marka için <strong>yasaklı</strong> olarak işaretli ve dönem içinde{' '}
          {formatNumber(f.productCount ?? 0)} üründe görüldü. Son görülme <Ago at={f.lastSeenAt} />.
          {f.note && <div className="mt-1 text-xs italic text-(--color-muted)">“{f.note}”</div>}
        </>
      );
    case 'belowReferencePrice':
      return (
        <>
          <strong>{f.sellerName || f.sellerRef}</strong> bu ürünü, sizin yayımladığınız{' '}
          <strong>{formatMoney(f.referencePrice ? BigInt(f.referencePrice) : null)}</strong> tavsiye fiyatın{' '}
          <strong>%{(f.shortfallPct ?? 0).toFixed(1)}</strong> altında —{' '}
          {formatMoney(f.lowestPrice ? BigInt(f.lowestPrice) : null)} — {formatNumber(f.looksBelow ?? 0)}{' '}
          bakışta. Son <Ago at={f.lastBelowAt} />.
          <div className="mt-1 text-xs text-(--color-muted)">
            Gösterilen, dönem içindeki <em>en düşük</em> teklifidir; ortalaması değil.
          </div>
        </>
      );
    case 'notOnAuthorisedList':
      return (
        <>
          Yetkili satıcı listesi tanımlı, bu satıcı listede yok ve {formatNumber(f.productCount ?? 0)} üründe
          görüldü. Son görülme <Ago at={f.lastSeenAt} />.
        </>
      );
    case 'belowMarketAverage':
      return (
        <>
          Bulunduğu listelemelerde ortalama <strong>{formatPercent(f.deviationPct ?? 0)}</strong> piyasa farkı
          — {formatNumber(f.observationCount ?? 0)} teklif, {formatNumber(f.productCount ?? 0)} ürün.
        </>
      );
    case 'deepDiscountOnOneProduct':
      return (
        <>
          <strong>{f.sellerName || f.sellerRef}</strong> bu üründe{' '}
          <strong>{formatPercent(f.deviationPct ?? 0)}</strong> piyasa farkıyla satıyor; aynı satıcının diğer
          ürünlerindeki farkı {formatPercent(f.otherDeviationPct ?? 0)}. Aradaki karşıtlık bulgunun
          kendisidir.
        </>
      );
    case 'persistentUndercut':
      return (
        <>
          Kendi tekliflerinin <strong>%{(f.sharePct ?? 0).toFixed(0)}</strong> kadarında listenin en ucuzu —{' '}
          {formatNumber(f.productCount ?? 0)} ürün, {formatNumber(f.observationCount ?? 0)} teklif.
        </>
      );
    case 'newSeller':
      return (
        <>
          İlk kez <Ago at={f.firstSeenAt} /> görüldü ({(f.daysAgo ?? 0).toFixed(1)} gün önce),{' '}
          {formatNumber(f.productCount ?? 0)} üründe. İlk <em>görülme</em>dir, satışa başlama tarihi değil.
        </>
      );
    case 'unrelatedCategory':
      return (
        <>
          Bu ürün <strong>{f.categoryName}</strong> kategorisinde; markanın bu kategoride yalnızca{' '}
          {formatNumber(f.categoryProductCount ?? 0)} ürünü var.
        </>
      );
    case 'brandRefDisagreement':
      return (
        <>
          Bu ürünü markanın <strong>arama terimi</strong> buldu ama pazaryeri onu markanın{' '}
          <strong>marka id&apos;sine</strong> bağlamıyor. İkisinden biri yanlış: ya ürün başka bir markanın
          altında listelenmiş, ya da marka adını taşıyan başka bir firmanın ürünü.
        </>
      );
  }
}

/**
 * Kesin bilgi vurgulu, yorum sakin.
 *
 * Yorum bulgularının hepsi aynı nötr rozeti taşır — aralarında renkle bir önem sırası kurmak,
 * kaynağı aynı olan iki tahminden birini diğerinden emin gösterirdi.
 */
const BASIS_CLASS: Record<FindingBasis, string> = {
  stated: 'bg-(--color-danger-bg) text-(--color-danger)',
  measured: 'bg-(--color-chip-bg) text-(--color-chip-text)',
};

/** Bir bulgu satırı — kartın kendisi, dayanağı ne olursa olsun aynı biçimde. */
function FindingRow({
  finding,
  sinceMs,
  brandId,
  isOpen,
  onToggleEvidence,
  evidence,
  evidenceLoading,
}: {
  finding: Finding;
  sinceMs: number;
  brandId: string;
  isOpen: boolean;
  onToggleEvidence: (f: Finding) => void;
  evidence: EvidenceLook[] | null;
  evidenceLoading: boolean;
}) {
  const f = finding;
  return (
    <div className="rounded border border-(--color-border)">
      <div className="flex flex-wrap items-start gap-3 p-3">
        <span className={`rounded px-2 py-0.5 text-xs ${BASIS_CLASS[f.basis]}`}>
          {labelOf(FINDING_BASIS_LABELS, f.basis)}
        </span>
        <div className="min-w-64 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{labelOf(FINDING_KIND_LABELS, f.kind)}</span>
            {f.subject.kind === 'seller' ? (
              <Link
                className="text-(--color-accent) hover:underline"
                /* Carries the finding's own scope — the window and the brand it was raised
                   under. The seller page shows both archives; without the scope the operator
                   arrived at that firm's whole footprint and had to rebuild the filter that
                   produced the alert they had just clicked. */
                href={`/competitors/sellers/${f.subject.marketplaceCode}/${encodeURIComponent(f.subject.sellerRef)}?sinceMs=${sinceMs}${brandId ? `&watchedBrandId=${encodeURIComponent(brandId)}` : ''}`}
              >
                {f.subject.name || f.subject.sellerRef}
              </Link>
            ) : (
              <Link
                className="text-(--color-accent) hover:underline"
                href={`/tracked-products/${f.subject.trackedProductId}`}
              >
                {f.subject.label}
              </Link>
            )}
            {/*
              "Ne zamandır burada?" — bir denetçinin listeyi tararken sorduğu ikinci soru.
              Türetilmiş bulgu bunu bilemez; saklanan durum bilir. Değerlendirme henüz bu
              bulguyu görmediyse tarih yok, bugünün tarihi gösterilmez.
            */}
            {f.openedAt != null && (
              <span className="rounded bg-(--color-chip-bg) px-1.5 py-0.5 text-xs text-(--color-chip-text)">
                <Ago at={f.openedAt} />
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-(--color-muted)">{describe(f)}</div>
        </div>
        <button
          type="button"
          onClick={() => onToggleEvidence(f)}
          className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
        >
          {isOpen ? 'Kanıtı kapat' : 'Kanıt'}
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-(--color-border) bg-(--color-hover) p-3">
          {evidenceLoading && (
            <p aria-live="polite" className="text-sm text-(--color-muted)">
              Kanıt yükleniyor…
            </p>
          )}
          {!evidenceLoading && evidence?.length === 0 && (
            <div className="text-sm text-(--color-muted)">Bu dönemde kayıtlı ham gözlem bulunamadı.</div>
          )}
          {!evidenceLoading &&
            evidence?.map((look) => (
              <div key={`${look.trackedProductId}-${look.observedAt}`} className="mb-3">
                <div className="mb-1 text-xs text-(--color-muted)">
                  <Ago at={look.observedAt} /> · {look.productLabel}
                </div>
                {/* Bulgunun kendi satırı değil, **bakışın tamamı**: “piyasanın altında” diğer
                    satırlar hakkında bir cümledir, yanında karşılaştıracak bir şey olmayan tek
                    bir fiyat ne doğrular ne yalanlar. */}
                <table className="w-full text-xs">
                  <thead className="text-left text-(--color-muted)">
                    <tr>
                      <th className="py-1 pr-2">Sıra</th>
                      <th className="py-1 pr-2">Satıcı</th>
                      <th className="py-1 pr-2">Fiyat</th>
                      <th className="py-1 pr-2">Kupon sonrası</th>
                      <th className="py-1 pr-2">Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {look.offers.map((offer, index) => {
                      const isSubject =
                        f.subject.kind === 'seller'
                          ? offer.sellerRef === f.subject.sellerRef
                          : offer.sellerRef !== null && offer.sellerRef === f.sellerRef;
                      return (
                        <tr
                          key={`${offer.sellerRef ?? 'anon'}-${index}`}
                          className={`border-t border-(--color-border) ${isSubject ? 'font-medium' : ''}`}
                        >
                          <td className="py-1 pr-2">{offer.rank ?? '—'}</td>
                          <td className="py-1 pr-2">
                            {offer.sellerName ?? (
                              <span className="text-(--color-muted)">kimliksiz teklif</span>
                            )}
                          </td>
                          <td className="py-1 pr-2 tabular-nums">
                            {formatMoney(offer.price === null ? null : BigInt(offer.price))}
                          </td>
                          <td className="py-1 pr-2 tabular-nums">
                            {formatMoney(offer.finalPrice === null ? null : BigInt(offer.finalPrice))}
                          </td>
                          <td className="py-1 pr-2 tabular-nums">{offer.offeredStock ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(() => {
                  const pageUrl = marketplaceProductUrl(look.marketplaceCode, look.productUrl);
                  return pageUrl ? (
                    <a
                      className="text-xs text-(--color-accent) hover:underline"
                      href={pageUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Pazaryerindeki sayfa ↗
                    </a>
                  ) : null;
                })()}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Bir dayanak grubu ("Kesin Bilgi" ya da "Yorum") başlığıyla birlikte.
 *
 * Sunucudaki sıralama (`KIND_ORDER`) zaten kesin bilgiyi yoruma önde tutuyordu; bu bileşen o sırayı
 * değiştirmez, yalnızca görünür kılar — operatör artık her rozeti tek tek okumadan hangi grupta
 * olduğunu başlıktan bilir.
 */
function FindingGroup({
  id,
  title,
  hint,
  findings,
  sinceMs,
  brandId,
  openId,
  onToggleEvidence,
  evidence,
  evidenceLoading,
}: {
  id: string;
  title: string;
  hint: string;
  findings: Finding[];
  sinceMs: number;
  brandId: string;
  openId: string | null;
  onToggleEvidence: (f: Finding) => void;
  evidence: EvidenceLook[] | null;
  evidenceLoading: boolean;
}) {
  if (findings.length === 0) return null;
  const headingId = id;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div>
        <h3 id={headingId} className="text-sm font-semibold">
          {title} <span className="font-normal text-(--color-muted)">· {formatNumber(findings.length)}</span>
        </h3>
        <p className="text-xs text-(--color-muted)">{hint}</p>
      </div>
      <div className="space-y-2">
        {findings.map((f) => (
          <FindingRow
            key={f.id}
            finding={f}
            sinceMs={sinceMs}
            brandId={brandId}
            isOpen={openId === f.id}
            onToggleEvidence={onToggleEvidence}
            evidence={openId === f.id ? evidence : null}
            evidenceLoading={openId === f.id && evidenceLoading}
          />
        ))}
      </div>
    </section>
  );
}

export function FindingsClient() {
  const [sinceMs, setSinceMs] = useState(daysAgo(30));
  const [brandId, setBrandId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<FindingKind>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceLook[] | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [showThresholds, setShowThresholds] = useState(false);
  const [draft, setDraft] = useState<Thresholds | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setOpenId(null);
    const params = new URLSearchParams({ sinceMs: String(sinceMs) });
    if (brandId) params.set('watchedBrandId', brandId);
    fetch(`/api/brand-reports/findings?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Bulgular yüklenemedi.'))))
      .then((data: Report) => {
        setReport(data);
        setDraft(data.thresholds);
        if (!brandId && data.brand) setBrandId(data.brand.id);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sinceMs, brandId]);

  useEffect(load, [load]);

  /** Bir bulgunun dayandığı ham gözlemler — konusu satıcıysa satıcının, ürünse ürünün bakışları. */
  const openEvidence = useCallback(
    (finding: Finding) => {
      if (openId === finding.id) {
        setOpenId(null);
        return;
      }
      setOpenId(finding.id);
      setEvidence(null);
      setEvidenceLoading(true);
      const params = new URLSearchParams({ sinceMs: String(sinceMs) });
      if (finding.subject.kind === 'seller') {
        params.set('marketplaceCode', finding.subject.marketplaceCode);
        params.set('sellerRef', finding.subject.sellerRef);
      } else {
        params.set('trackedProductId', finding.subject.trackedProductId);
      }
      fetch(`/api/brand-reports/evidence?${params}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Kanıt yüklenemedi.'))))
        .then((data: { looks: EvidenceLook[] }) => setEvidence(data.looks))
        .catch(() => setEvidence([]))
        .finally(() => setEvidenceLoading(false));
    },
    [openId, sinceMs],
  );

  const saveThresholds = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/brand-reports/thresholds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Eşikler kaydedilemedi.');
      }
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const resetThresholds = useCallback(async () => {
    setSaving(true);
    await fetch('/api/brand-reports/thresholds', { method: 'DELETE' });
    setSaving(false);
    load();
  }, [load]);

  const findings = report?.findings ?? [];
  const visible = useMemo(() => findings.filter((f) => !hidden.has(f.kind)), [findings, hidden]);
  const visibleStated = useMemo(() => visible.filter((f) => f.basis === 'stated'), [visible]);
  const visibleMeasured = useMemo(() => visible.filter((f) => f.basis === 'measured'), [visible]);

  const counts = useMemo(() => {
    const map = new Map<FindingKind, number>();
    for (const f of findings) map.set(f.kind, (map.get(f.kind) ?? 0) + 1);
    return map;
  }, [findings]);

  const statedCount = findings.filter((f) => f.basis === 'stated').length;

  // First load never resolved — nothing but the shell of the screen can be shown honestly.
  if (error && !report) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Denetim Bulguları"
          description="Marka arşivinden çıkan, bakılmaya değer noktalar."
        />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!report) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Denetim Bulguları"
          description="Marka arşivinden çıkan, bakılmaya değer noktalar."
        />
        <LoadingState message="Bulgular yükleniyor…" skeletonRows={3} />
      </div>
    );
  }

  const hasCoverageNotes =
    report.notificationsConfigured === false ||
    !report.context?.hasAuthorisedList ||
    Boolean(report.context?.referencePrice) ||
    Boolean(report.context?.referencePrice?.truncated) ||
    Boolean(report.context?.truncatedDeviations);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Denetim Bulguları"
        description="Hiçbiri bir ihlal iddiası değildir — her bulgu dayandığı ham gözleme kadar açılır ve kararı okuyan verir."
        action={
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-(--color-muted)">Marka</span>
              <select
                className="rounded border border-(--color-border) px-2 py-1"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
              >
                <option value="">Marka seçin…</option>
                {report.groups.map((g) => (
                  <optgroup key={g.id} label={g.name}>
                    {report.brands
                      .filter((b) => b.groupId === g.id)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-(--color-muted)">Dönem</span>
              <select
                className="rounded border border-(--color-border) px-2 py-1"
                value={String(sinceMs)}
                onChange={(e) => setSinceMs(Number(e.target.value))}
              >
                <option value={String(daysAgo(7))}>Son 7 gün</option>
                <option value={String(daysAgo(30))}>Son 30 gün</option>
                <option value={String(daysAgo(90))}>Son 90 gün</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setShowThresholds((v) => !v)}
              aria-expanded={showThresholds}
              className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
            >
              Eşikler
            </button>
          </div>
        }
      />

      {/* A refresh triggered by changing the brand or period failed while the previous read is
          still on screen — the numbers below are real but for the old selection, and saying so
          costs a line (doc 15 §3.2 "Stale"). */}
      {error && (
        <p role="alert" className={`rounded border p-3 text-sm ${TONE_BOX.warn}`}>
          Yenileme başarısız oldu: {error}
        </p>
      )}
      {loading && (
        <p aria-live="polite" className="text-sm text-(--color-muted)">
          Yenileniyor…
        </p>
      )}

      {showThresholds && draft && (
        <Section
          id="thresholds-heading"
          title="Eşikler"
          action={
            <span className="text-xs text-(--color-muted)">
              {report.thresholdsAreDefault
                ? 'Varsayılan değerler kullanılıyor'
                : 'Bu kurulum için değiştirilmiş'}
            </span>
          }
        >
          <div className="space-y-3 rounded border border-(--color-border) p-4">
            {/* Her bulgu bir eşikten çıkar ve hiçbiri koda gömülü değil: burada değiştirilen
                sayı tüm geçmişi yeniden yanıtlar, yalnızca bundan sonrasını değil. */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {THRESHOLD_FIELDS.map((field) => (
                <label key={field.key} className="text-sm">
                  <span className="mb-1 block">{field.label}</span>
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="w-24 rounded border border-(--color-border) px-2 py-1"
                      value={draft[field.key]}
                      onChange={(e) => setDraft({ ...draft, [field.key]: Number(e.target.value) })}
                    />
                    <span className="text-xs text-(--color-muted)">{field.unit}</span>
                  </span>
                  <span className="mt-1 block text-xs text-(--color-muted)">{field.help}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={saveThresholds}
                className="rounded bg-(--color-accent) px-3 py-1 text-sm text-(--color-accent-ink) disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet ve yeniden hesapla'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={resetThresholds}
                className="rounded border border-(--color-border) px-3 py-1 text-sm hover:bg-(--color-hover) disabled:opacity-50"
              >
                Varsayılanlara dön
              </button>
            </div>
            <p className="text-xs text-(--color-muted)">
              Eşik değişiklikleri kim değiştirdiyse onunla birlikte kaydedilir (<code>settings_audit</code>).
              Bir satıcının denetim listesine girip girmeyeceğini belirleyen sayı, izsiz değişmemeli.
            </p>
          </div>
        </Section>
      )}

      {report.needsBrand && !loading && (
        <EmptyState
          message="Bulgular için bir marka seçin."
          reason="Politika markaya özeldir — aynı firma çoğu zaman bir markanın yetkili distribütörü, diğerininse hiç tanımlanmamış satıcısıdır; grup genelinde tek bir yanıt vermek ikisinden biri hakkında yanlış olurdu."
        />
      )}

      {report.brand && (
        <>
          <Section id="summary-heading" title="Özet">
            <div aria-live="polite" className="flex flex-wrap items-center gap-4 text-sm">
              <span>
                <strong>{formatNumber(findings.length)}</strong> bulgu
              </span>
              <span className="text-(--color-muted)">
                {formatNumber(statedCount)} kesin bilgi · {formatNumber(findings.length - statedCount)} yorum
              </span>
              <span className="text-(--color-muted)">
                {formatNumber(report.context?.sellerCount ?? 0)} satıcı,{' '}
                {formatNumber(report.context?.productCount ?? 0)} ürün üzerinden
              </span>
            </div>

            {/* Kapsam ve bildirim notları tek bir açılır grup altında: dördü de ayrı ayrı kutu
                olarak dizildiğinde birincil bilgiyi (bulgu listesini) sayfanın dışına itiyordu.
                Varsayılan olarak açık — bunlar "olmasa da olur" değil, bulgu yokluğunun ne anlama
                geldiğini belirleyen notlar (§4 adım 3, "Current UX Problems" #5). */}
            {hasCoverageNotes && (
              <details open className="mt-3 rounded border border-(--color-border) bg-(--color-surface)">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                  Kapsam ve bildirim notları
                </summary>
                <div className="space-y-2 border-t border-(--color-border) p-3 text-sm text-(--color-muted)">
                  {report.notificationsConfigured === false && (
                    <p>
                      Yeni bulgular için <strong>bildirim yapılandırılmamış</strong> — bulgular hesaplanıyor
                      ve saklanıyor, ama kimseye iletilmiyor. Bir webhook adresi
                      <code className="mx-1">FINDINGS_WEBHOOK_URL</code>
                      ortam değişkeninden okunur (adres bir anahtar sayıldığı için veritabanında tutulmaz).
                    </p>
                  )}
                  {!report.context?.hasAuthorisedList && (
                    <p>
                      Bu marka için <strong>yetkili satıcı listesi tanımlı değil</strong>, bu yüzden “yetkili
                      listesinde yok” sinyali hiç üretilmiyor. Liste girilmemiş olması diğer herkesin yetkisiz
                      olduğu anlamına gelmez — hiçbir şey söylenmemiş demektir.{' '}
                      <Link className="underline" href="/watched-brands/policy">
                        Satıcı Politikası
                      </Link>{' '}
                      ekranından girebilirsiniz.
                    </p>
                  )}
                  {report.context?.referencePrice && (
                    <p>
                      {report.context.referencePrice.productsWithPrice === 0 ? (
                        <>
                          Bu marka için <strong>tavsiye edilen satış fiyatı girilmemiş</strong>, bu yüzden
                          “tavsiye fiyatın altında” sinyali hiç üretilmiyor. Fiyat listenizi{' '}
                          <Link className="underline" href="/tracked-products">
                            Takip Edilen Ürünler
                          </Link>{' '}
                          ekranından Excel olarak yükleyebilirsiniz.
                        </>
                      ) : (
                        <>
                          Tavsiye fiyat kapsamı:{' '}
                          <strong>
                            {formatNumber(report.context.referencePrice.productsWithPrice)} /{' '}
                            {formatNumber(report.context.referencePrice.productsTotal)}
                          </strong>{' '}
                          ürün. Fiyat listesi olmayan ürünler bu sinyalin dışındadır — “altında değil” değil,
                          “bilinmiyor”.
                        </>
                      )}
                    </p>
                  )}
                  {report.context?.referencePrice?.truncated && (
                    <p className={`rounded border p-2 ${TONE_BOX.warn}`}>
                      Tavsiye fiyatın altındaki eşleşmeler sınıra dayandı ve liste kesildi. Gösterilenler en
                      derin sapanlar; toleransı yükseltmek listeyi daraltır.
                    </p>
                  )}
                  {report.context?.truncatedDeviations && (
                    <p className={`rounded border p-2 ${TONE_BOX.warn}`}>
                      Derin indirim eşiği çok geniş: sınırın üstünde eşleşme var ve liste kesildi. Eşiği
                      yükseltmek listeyi daraltır.
                    </p>
                  )}
                </div>
              </details>
            )}
          </Section>

          <Section id="findings-heading" title={`Bulgular · ${formatNumber(visible.length)}`}>
            {findings.length === 0 ? (
              <EmptyState
                message="Bu dönemde ve bu eşiklerle bulgu yok."
                reason="Eşikler bir keşif aracıdır — hiçbir şey çıkmıyorsa daraltmayı deneyin."
                action={
                  <button
                    type="button"
                    onClick={() => setShowThresholds(true)}
                    className="rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm font-semibold hover:bg-(--color-hover)"
                  >
                    Eşikleri aç
                  </button>
                }
              />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {([...counts.keys()] as FindingKind[])
                    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
                    .map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        aria-pressed={!hidden.has(kind)}
                        onClick={() =>
                          setHidden((prev) => {
                            const next = new Set(prev);
                            if (next.has(kind)) next.delete(kind);
                            else next.add(kind);
                            return next;
                          })
                        }
                        className={`rounded-full border px-3 py-1 text-xs ${
                          hidden.has(kind)
                            ? 'border-(--color-border) text-(--color-muted) line-through'
                            : 'border-(--color-accent) text-(--color-accent)'
                        }`}
                      >
                        {labelOf(FINDING_KIND_LABELS, kind)} · {formatNumber(counts.get(kind) ?? 0)}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        `denetim-bulgulari-${report.brand!.label}.csv`,
                        visible.map((f) => ({
                          Bulgu: labelOf(FINDING_KIND_LABELS, f.kind),
                          Dayanak: labelOf(FINDING_BASIS_LABELS, f.basis),
                          Konu:
                            f.subject.kind === 'seller'
                              ? f.subject.name || f.subject.sellerRef
                              : f.subject.label,
                          'Konu Türü': f.subject.kind === 'seller' ? 'Satıcı' : 'Ürün',
                          'Satıcı Kodu': f.subject.kind === 'seller' ? f.subject.sellerRef : '',
                          Ürün: f.productLabel ?? '',
                          'Sapma %': f.deviationPct?.toFixed(2) ?? '',
                          'Diğer Ürünler %': f.otherDeviationPct?.toFixed(2) ?? '',
                          'En Ucuz %': f.sharePct?.toFixed(1) ?? '',
                          'Ürün Sayısı': f.productCount ?? '',
                          Kategori: f.categoryName ?? '',
                          Not: f.note ?? '',
                          'İlk Görülme': f.firstSeenAt ? formatDateTime(f.firstSeenAt) : '',
                          'Son Görülme': f.lastSeenAt ? formatDateTime(f.lastSeenAt) : '',
                          Eşik: f.thresholdKey ?? '',
                        })),
                      )
                    }
                    className="ml-auto rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
                  >
                    Excel&apos;e Aktar
                  </button>
                </div>

                {visible.length === 0 ? (
                  <EmptyState
                    message="Seçili türler gizlendi."
                    reason="Yukarıdaki türlerden birine tekrar tıklayarak geri getirebilirsiniz."
                  />
                ) : (
                  <>
                    <FindingGroup
                      id="findings-group-stated"
                      title={labelOf(FINDING_BASIS_LABELS, 'stated')}
                      hint="Operatörün kendi yazdığı bir kayda dayanır — bir yorum değildir."
                      findings={visibleStated}
                      sinceMs={sinceMs}
                      brandId={brandId}
                      openId={openId}
                      onToggleEvidence={openEvidence}
                      evidence={evidence}
                      evidenceLoading={evidenceLoading}
                    />
                    <FindingGroup
                      id="findings-group-measured"
                      title={labelOf(FINDING_BASIS_LABELS, 'measured')}
                      hint="Gözlenen fiyatlardan çıkarılır; döneme ve seçilen eşiğe göre değişir."
                      findings={visibleMeasured}
                      sinceMs={sinceMs}
                      brandId={brandId}
                      openId={openId}
                      onToggleEvidence={openEvidence}
                      evidence={evidence}
                      evidenceLoading={evidenceLoading}
                    />
                  </>
                )}
              </div>
            )}
          </Section>

          <p className="text-xs text-(--color-muted)">
            Sayılar <strong>tekliflerden</strong> gelir: bir satıcının ürünü kaç kez <em>listelediğini</em>{' '}
            gösterir, kaç adet sattığını değil. “Piyasa farkı” satıcının bulunduğu her listelemedeki{' '}
            <em>ortalama</em> fiyata göredir; medyana göre değil — nedeni <code>brand-reports.ts</code> içinde
            yazılı. Kanıt penceresi ham gözlem satırlarının kendisidir, özeti değil.
          </p>
        </>
      )}
    </div>
  );
}
