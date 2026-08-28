'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { marketplaceProductUrl } from '@/lib/product-url';

/**
 * Denetim bulguları (doc 06 §12.4, Faz 6).
 *
 * Faz 4 markayı kimin sattığını, Faz 5 kimin satması gerektiğini söyler. Bu ekran **bakılmaya
 * değer olanı** söyler ve bunu iki farklı güvenle söyler:
 *
 * - **Kesin bilgi** — operatörün kendi yazdığı bir kayda dayanır. "Yasaklı satıcı bu markayı
 *   satıyor" bir yorum değil: kuralı biri yazdı, satıcı da sayfada.
 * - **Yorum** — gözlenen fiyatlardan çıkarılır. "Piyasanın %22 altında" bir örneklem yorumudur;
 *   döneme, o an sayfada kimin bulunduğuna ve birinin seçtiği bir eşiğe göre değişir.
 *
 * Sıralama bu ayrımdan çıkar, önem tablosundan değil: kesin bilgi, sayısı ne kadar çarpıcı
 * olursa olsun yorumun üstündedir. Karar mantığının tamamı `packages/core` içinde saf ve
 * tablo-testlidir; bu dosya yalnızca gösterir.
 *
 * ⚠️ Hiçbir satır bir ihlal iddiası değildir. Bulgu "şuraya bak" der; ihtarı insan gönderir.
 */

type FindingKind =
  | 'blockedSellerPresent'
  | 'notOnAuthorisedList'
  | 'deepDiscountOnOneProduct'
  | 'persistentUndercut'
  | 'belowMarketAverage'
  | 'newSeller'
  | 'unrelatedCategory'
  | 'brandRefDisagreement';

type Subject =
  | { kind: 'seller'; marketplaceCode: string; sellerRef: string; name: string }
  | { kind: 'product'; trackedProductId: string; label: string };

interface Finding {
  id: string;
  kind: FindingKind;
  basis: 'stated' | 'measured';
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
}

interface Thresholds {
  belowMarketPct: number;
  deepDiscountPct: number;
  deepDiscountContrastPct: number;
  undercutSharePct: number;
  undercutMinProducts: number;
  newSellerDays: number;
  minObservations: number;
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
  filters?: { sinceMs: number; untilMs: number };
  context?: {
    hasAuthorisedList: boolean;
    sellerCount: number;
    productCount: number;
    truncatedDeviations: boolean;
    truncatedDisagreements: boolean;
    disagreementTotal: number;
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

const KIND_LABEL: Record<FindingKind, string> = {
  blockedSellerPresent: 'Yasaklı satıcı satışta',
  notOnAuthorisedList: 'Yetkili listesinde yok',
  deepDiscountOnOneProduct: 'Tek üründe derin indirim',
  persistentUndercut: 'Sistematik fiyat kırma',
  belowMarketAverage: 'Piyasa altı ortalama',
  newSeller: 'Yeni görülen satıcı',
  unrelatedCategory: 'Alakasız kategori',
  brandRefDisagreement: 'Marka eşleşmesi uyuşmuyor',
};

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
          {formatNumber(f.productCount ?? 0)} üründe görüldü. Son görülme{' '}
          {formatDateTime(f.lastSeenAt)}.
          {f.note && <div className="mt-1 text-xs italic text-(--color-muted)">“{f.note}”</div>}
        </>
      );
    case 'notOnAuthorisedList':
      return (
        <>
          Yetkili satıcı listesi tanımlı, bu satıcı listede yok ve{' '}
          {formatNumber(f.productCount ?? 0)} üründe görüldü. Son görülme{' '}
          {formatDateTime(f.lastSeenAt)}.
        </>
      );
    case 'belowMarketAverage':
      return (
        <>
          Bulunduğu listelemelerde ortalama <strong>{formatPercent(f.deviationPct ?? 0)}</strong>{' '}
          piyasa farkı — {formatNumber(f.observationCount ?? 0)} teklif,{' '}
          {formatNumber(f.productCount ?? 0)} ürün.
        </>
      );
    case 'deepDiscountOnOneProduct':
      return (
        <>
          <strong>{f.sellerName || f.sellerRef}</strong> bu üründe{' '}
          <strong>{formatPercent(f.deviationPct ?? 0)}</strong> piyasa farkıyla satıyor; aynı
          satıcının diğer ürünlerindeki farkı {formatPercent(f.otherDeviationPct ?? 0)}. Aradaki
          karşıtlık bulgunun kendisidir.
        </>
      );
    case 'persistentUndercut':
      return (
        <>
          Kendi tekliflerinin <strong>%{(f.sharePct ?? 0).toFixed(0)}</strong> kadarında listenin
          en ucuzu — {formatNumber(f.productCount ?? 0)} ürün,{' '}
          {formatNumber(f.observationCount ?? 0)} teklif.
        </>
      );
    case 'newSeller':
      return (
        <>
          İlk kez {formatDateTime(f.firstSeenAt)} tarihinde görüldü (
          {(f.daysAgo ?? 0).toFixed(1)} gün önce), {formatNumber(f.productCount ?? 0)} üründe.
          İlk <em>görülme</em>dir, satışa başlama tarihi değil.
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
          <strong>marka id&apos;sine</strong> bağlamıyor. İkisinden biri yanlış: ya ürün başka bir
          markanın altında listelenmiş, ya da marka adını taşıyan başka bir firmanın ürünü.
        </>
      );
  }
}

const BASIS_LABEL = { stated: 'Kesin bilgi', measured: 'Yorum' } as const;

/**
 * Kesin bilgi vurgulu, yorum sakin.
 *
 * Yorum bulgularının hepsi aynı nötr rozeti taşır — aralarında renkle bir önem sırası kurmak,
 * kaynağı aynı olan iki tahminden birini diğerinden emin gösterirdi.
 */
const BASIS_CLASS = {
  stated: 'bg-(--color-danger-bg) text-(--color-danger)',
  measured: 'bg-(--color-chip-bg) text-(--color-chip-text)',
} as const;

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

  const counts = useMemo(() => {
    const map = new Map<FindingKind, number>();
    for (const f of findings) map.set(f.kind, (map.get(f.kind) ?? 0) + 1);
    return map;
  }, [findings]);

  const statedCount = findings.filter((f) => f.basis === 'stated').length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Denetim Bulguları</h1>
          <p className="mt-1 max-w-3xl text-sm text-(--color-muted)">
            Marka arşivinden çıkan, bakılmaya değer noktalar. Hiçbiri bir ihlal iddiası değildir —
            her bulgu dayandığı ham gözleme kadar açılır ve kararı okuyan verir.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-(--color-muted)">Marka</span>
            <select
              className="rounded border border-(--color-border) px-2 py-1"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
            >
              <option value="">Marka seçin…</option>
              {(report?.groups ?? []).map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {(report?.brands ?? [])
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
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
          >
            Eşikler
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-3 text-sm">
          {error}
        </div>
      )}
      {loading && <div className="text-sm text-(--color-muted)">Yükleniyor…</div>}

      {showThresholds && draft && (
        <div className="space-y-3 rounded border border-(--color-border) p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Eşikler</h2>
            <span className="text-xs text-(--color-muted)">
              {report?.thresholdsAreDefault
                ? 'Varsayılan değerler kullanılıyor'
                : 'Bu kurulum için değiştirilmiş'}
            </span>
          </div>
          {/* Her bulgu bir eşikten çıkar ve hiçbiri koda gömülü değil: burada değiştirilen sayı
              tüm geçmişi yeniden yanıtlar, yalnızca bundan sonrasını değil. */}
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
              Kaydet ve yeniden hesapla
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={resetThresholds}
              className="rounded border border-(--color-border) px-3 py-1 text-sm hover:bg-(--color-hover)"
            >
              Varsayılanlara dön
            </button>
          </div>
          <p className="text-xs text-(--color-muted)">
            Eşik değişiklikleri kim değiştirdiyse onunla birlikte kaydedilir (
            <code>settings_audit</code>). Bir satıcının denetim listesine girip girmeyeceğini
            belirleyen sayı, izsiz değişmemeli.
          </p>
        </div>
      )}

      {report?.needsBrand && !loading && (
        <div className="rounded border border-(--color-border) p-4 text-sm">
          Bulgular için bir <strong>marka</strong> seçin. Politika markaya özeldir — aynı firma
          çoğu zaman bir markanın yetkili distribütörü, diğerininse hiç tanımlanmamış satıcısıdır;
          grup genelinde tek bir yanıt vermek ikisinden biri hakkında yanlış olurdu.
        </div>
      )}

      {report && report.brand && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span>
              <strong>{formatNumber(findings.length)}</strong> bulgu
            </span>
            <span className="text-(--color-muted)">
              {formatNumber(statedCount)} kesin bilgi · {formatNumber(findings.length - statedCount)}{' '}
              yorum
            </span>
            <span className="text-(--color-muted)">
              {formatNumber(report.context?.sellerCount ?? 0)} satıcı,{' '}
              {formatNumber(report.context?.productCount ?? 0)} ürün üzerinden
            </span>
          </div>

          {!report.context?.hasAuthorisedList && (
            <div className="rounded border border-(--color-border) p-3 text-sm text-(--color-muted)">
              Bu marka için <strong>yetkili satıcı listesi tanımlı değil</strong>, bu yüzden
              “yetkili listesinde yok” sinyali hiç üretilmiyor. Liste girilmemiş olması diğer
              herkesin yetkisiz olduğu anlamına gelmez — hiçbir şey söylenmemiş demektir.{' '}
              <Link className="underline" href="/watched-brands/policy">
                Satıcı Politikası
              </Link>{' '}
              ekranından girebilirsiniz.
            </div>
          )}

          {report.context?.truncatedDeviations && (
            <div className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-3 text-sm">
              Derin indirim eşiği çok geniş: sınırın üstünde eşleşme var ve liste kesildi. Eşiği
              yükseltmek listeyi daraltır.
            </div>
          )}

          {findings.length === 0 && !loading && (
            <div className="rounded border border-(--color-border) p-4 text-sm text-(--color-muted)">
              Bu dönemde ve bu eşiklerle bulgu yok. Eşikler bir keşif aracıdır — hiçbir şey
              çıkmıyorsa <em>Eşikler</em> panelinden daraltmayı deneyin.
            </div>
          )}

          {findings.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {([...counts.keys()] as FindingKind[])
                .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
                .map((kind) => (
                  <button
                    key={kind}
                    type="button"
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
                    {KIND_LABEL[kind]} · {formatNumber(counts.get(kind) ?? 0)}
                  </button>
                ))}
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    `denetim-bulgulari-${report.brand!.label}.csv`,
                    visible.map((f) => ({
                      Bulgu: KIND_LABEL[f.kind],
                      Dayanak: BASIS_LABEL[f.basis],
                      Konu:
                        f.subject.kind === 'seller' ? f.subject.name || f.subject.sellerRef : f.subject.label,
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
          )}

          <div className="space-y-2">
            {visible.map((f) => (
              <div key={f.id} className="rounded border border-(--color-border)">
                <div className="flex flex-wrap items-start gap-3 p-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${BASIS_CLASS[f.basis]}`}>
                    {BASIS_LABEL[f.basis]}
                  </span>
                  <div className="min-w-64 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{KIND_LABEL[f.kind]}</span>
                      {f.subject.kind === 'seller' ? (
                        <Link
                          className="text-(--color-accent) hover:underline"
                          href={`/competitors/sellers/${f.subject.marketplaceCode}/${encodeURIComponent(f.subject.sellerRef)}`}
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
                    </div>
                    <div className="mt-1 text-sm text-(--color-muted)">{describe(f)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEvidence(f)}
                    className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
                  >
                    {openId === f.id ? 'Kanıtı kapat' : 'Kanıt'}
                  </button>
                </div>

                {openId === f.id && (
                  <div className="border-t border-(--color-border) bg-(--color-hover) p-3">
                    {evidenceLoading && <div className="text-sm text-(--color-muted)">Yükleniyor…</div>}
                    {!evidenceLoading && evidence?.length === 0 && (
                      <div className="text-sm text-(--color-muted)">
                        Bu dönemde kayıtlı ham gözlem bulunamadı.
                      </div>
                    )}
                    {!evidenceLoading &&
                      evidence?.map((look) => (
                        <div key={`${look.trackedProductId}-${look.observedAt}`} className="mb-3">
                          <div className="mb-1 text-xs text-(--color-muted)">
                            {formatDateTime(look.observedAt)} · {look.productLabel}
                          </div>
                          {/* Bulgunun kendi satırı değil, **bakışın tamamı**: “piyasanın altında”
                              diğer satırlar hakkında bir cümledir, yanında karşılaştıracak bir şey
                              olmayan tek bir fiyat ne doğrular ne yalanlar. */}
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
                                      {formatMoney(
                                        offer.finalPrice === null ? null : BigInt(offer.finalPrice),
                                      )}
                                    </td>
                                    <td className="py-1 pr-2 tabular-nums">{offer.offeredStock ?? '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {(() => {
                            const pageUrl = marketplaceProductUrl(
                              look.marketplaceCode,
                              look.productUrl,
                            );
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
            ))}
          </div>

          <p className="text-xs text-(--color-muted)">
            Sayılar <strong>tekliflerden</strong> gelir: bir satıcının ürünü kaç kez{' '}
            <em>listelediğini</em> gösterir, kaç adet sattığını değil. “Piyasa farkı” satıcının
            bulunduğu her listelemedeki <em>ortalama</em> fiyata göredir; medyana göre değil —
            nedeni <code>brand-reports.ts</code> içinde yazılı. Kanıt penceresi ham gözlem
            satırlarının kendisidir, özeti değil.
          </p>
        </>
      )}
    </div>
  );
}
