'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PriceChart } from '@/components/price-chart';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import { Ago, Chip, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { STATUS_LABELS } from '@/lib/labels';
import { lookAnnotations } from '@/lib/price-chart-series';
import { marketplaceProductUrl } from '@/lib/product-url';

interface SellerPoint {
  observedAt: number;
  rank: number | null;
  price: string | null;
  finalPrice: string | null;
  offeredStock: number | null;
  /** `null` is unknown — an older row, or a look that failed. Never rendered as "no promotion". */
  sellerRating: number | null;
  dispatchTime: number | null;
  hasPromotion: boolean | null;
  promotionText: string | null;
}

interface Seller {
  key: string;
  sellerName: string;
  sellerRef: string | null;
  unverifiedKey: boolean;
  current: SellerPoint | null;
  previousPrice: string | null;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  points: SellerPoint[];
}

interface Detail {
  product: {
    id: string;
    marketplaceCode: string;
    productRef: string;
    productUrl: string;
    label: string;
    isActive: boolean;
    addedAt: number;
    lastScrapedAt: number | null;
  };
  window: { sinceMs: number; untilMs: number };
  latestLook: { observedAt: number; status: string; offers: number } | null;
  looks: { observedAt: number; status: string; offers: number; buyboxPrice: string | null }[];
  sellers: Seller[];
}

/**
 * Buybox price across the window — the same chart component the listing detail draws, so the two
 * screens read alike. Hovering a look names the seller who held the buybox then, which is the
 * question this screen exists to answer and the one a bare line cannot.
 *
 * The seller comes from `sellers[].points`, joined on `observedAt`: both series are built from
 * the same look rows (`summariseLooks` / `seriesBySeller`), so the timestamps are equal, not
 * merely close. A failed look contributes no price — a gap, never a zero.
 */
function BuyboxChart({ looks, sellers }: { looks: Detail['looks']; sellers: Seller[] }) {
  const { buyboxSeller, secondPrice } = lookAnnotations(sellers);

  return (
    <PriceChart
      timestamps={looks.map((l) => l.observedAt)}
      series={[
        {
          key: 'buybox',
          label: 'Buybox',
          color: 'var(--color-warning)',
          values: looks.map((l) => (l.buyboxPrice ? BigInt(l.buyboxPrice) : null)),
        },
        {
          key: 'second',
          label: '2. Fiyat',
          color: 'var(--color-muted)',
          values: looks.map((l) => secondPrice.get(l.observedAt) ?? null),
        },
      ]}
      annotations={[
        { label: 'Buybox satıcı', values: looks.map((l) => buyboxSeller.get(l.observedAt) ?? null) },
        {
          label: 'Satıcı sayısı',
          values: looks.map((l) => (l.status === 'ok' ? formatNumber(l.offers) : null)),
        },
        {
          label: 'Bakış',
          values: looks.map((l) => STATUS_LABELS[l.status] ?? l.status),
        },
      ]}
    />
  );
}

/**
 * The promotion cell, and the reason it is a function rather than an inline ternary: it has
 * **three** outcomes, not two. `true` shows the promotion's own name when the page carried one;
 * `false` is a page that was read and had none; `null` — an older row, or a failed look — is
 * unknown, and rendering it as "yok" would tell an auditor a seller ran no campaign on a look
 * that never recorded whether they did.
 */
function promotionCell(point: SellerPoint | null): string {
  if (!point || point.hasPromotion === null) return '—';
  if (!point.hasPromotion) return 'yok';
  return point.promotionText ?? 'var';
}

/** Which way this seller's price moved since the look before — `null` when there is no earlier one. */
function priceDelta(seller: Seller): { kurus: bigint; up: boolean } | null {
  if (!seller.current?.price || !seller.previousPrice) return null;
  const now = BigInt(seller.current.price);
  const before = BigInt(seller.previousPrice);
  if (now === before) return null;
  return { kurus: now > before ? now - before : before - now, up: now > before };
}

/**
 * Takip edilen bir ürünün bütün satıcıları — fiyatları ve stokları (doc 06 §12.2, customer
 * feedback 2026-08-25). `/listings/[id]`'nin aksine burada maliyet şelalesi, motor durumu veya
 * fiyat gönderimi yok: bu ürünü biz satmıyoruz, `tracked_products` tablosu `Reprice`'ın hiç
 * görmediği bir tablo. Ekran tamamen **raporlamadır**.
 */
export function TrackedProductDetailClient({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // `useCallback` so the retry button in `ErrorState` and the effect below share one function
  // identity — the same shape `listing-detail-client.tsx` uses.
  const load = useCallback(() => {
    setError(null);
    fetch(`/api/tracked-products/${id}`)
      .then(async (r) => {
        const d = (await r.json()) as Detail & { error?: string };
        if (!r.ok) {
          setError(d.error ?? 'Ürün yüklenemedi.');
          return;
        }
        setDetail(d);
      })
      .catch(() => setError('Ürün yüklenemedi.'));
  }, [id]);

  useEffect(load, [load]);

  // Loading and error never share a line (doc 15 §3.2), and error carries a retry (§2 rule 6:
  // reuse the shared kit rather than a bare `<p>`).
  if (error) {
    return (
      <div className="p-6">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="p-6">
        <LoadingState message="Ürün yükleniyor…" skeletonRows={3} />
      </div>
    );
  }

  const { product, latestLook, looks, sellers } = detail;

  // Sıralama sunucuda (`seriesBySeller`): önce şu an teklif veren satıcılar sıraya göre, sonra
  // sayfadan çekilmiş olanlar. Çekilen satıcının satırı silinmiyor — düşmüş olması da bilgidir.
  const ordered = sellers;
  const buybox = ordered.find((s) => s.current?.rank === 1);
  const cheapest = [...ordered]
    .filter((s) => s.current?.price)
    .sort((a, b) => (BigInt(a.current!.price!) < BigInt(b.current!.price!) ? -1 : 1))[0];
  const activeSellers = ordered.filter((s) => s.current !== null);
  const totalStock = activeSellers.reduce((sum, s) => sum + (s.current?.offeredStock ?? 0), 0);
  // Stored links are absolute when pasted and path-only when swept — see marketplaceProductUrl.
  const pageUrl = marketplaceProductUrl(product.marketplaceCode, product.productUrl);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tracked-products" className="text-xs text-(--color-accent) hover:underline">
          ← Takip edilen ürünlere dön
        </Link>
        <h1 className="text-2xl font-semibold">{product.label}</h1>
        <p className="text-sm text-(--color-muted)">
          {product.marketplaceCode} · {product.productRef}
          {pageUrl && (
            <>
              {' · '}
              <a
                href={pageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-(--color-accent) hover:underline"
              >
                Ürün sayfasını aç
              </a>
            </>
          )}
          {!product.isActive && (
            <span className="ml-2">
              <Chip tone="neutral">Takip duraklatıldı</Chip>
            </span>
          )}
        </p>
      </div>

      {/* Şu An */}
      <section className="rounded border border-(--color-border) p-4" aria-labelledby="now-heading">
        <h2 id="now-heading" className="mb-3 text-lg font-medium">
          Şu An
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-(--color-muted)">Buybox Satıcı</div>
            <div className="text-lg">{buybox?.sellerName || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-(--color-muted)">Buybox Fiyat</div>
            <div className="text-lg">
              {formatMoney(buybox?.current?.price ? BigInt(buybox.current.price) : null)}
            </div>
          </div>
          <div>
            <div className="text-xs text-(--color-muted)">En Ucuz Teklif</div>
            <div className="text-lg">
              {formatMoney(cheapest?.current?.price ? BigInt(cheapest.current.price) : null)}
            </div>
          </div>
          <div>
            <div className="text-xs text-(--color-muted)">Satıcı Sayısı</div>
            <div className="text-lg">{formatNumber(activeSellers.length)}</div>
          </div>
          <div>
            <div className="text-xs text-(--color-muted)">Toplam Görünen Stok</div>
            <div className="text-lg">{formatNumber(totalStock)}</div>
          </div>
          <div>
            {/* İki ayrı olgu, iki ayrı satır: ne zaman baktık, ve en son ne zaman bir şey
                değişti. Faz 4'ten beri bakış ancak teklif seti kıpırdadığında kaydediliyor,
                yani fiyatı bir haftadır sabit olan ürün "bir haftadır bakılmamış" gibi
                okunurdu — okunmasın diye ikisi ayrı gösteriliyor. */}
            <div className="text-xs text-(--color-muted)">Son Bakış</div>
            <div className="text-sm">
              <Ago at={product.lastScrapedAt} never="henüz taranmadı" />
              {latestLook && latestLook.status !== 'ok' && (
                <span className="ml-1 text-(--color-danger)">
                  ⚠ {STATUS_LABELS[latestLook.status] ?? latestLook.status}
                </span>
              )}
            </div>
            {latestLook && (
              <div className="text-xs text-(--color-muted)">
                son değişiklik: <Ago at={latestLook.observedAt} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Satıcılar */}
      <section className="rounded border border-(--color-border) p-4" aria-labelledby="sellers-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="sellers-heading" className="text-lg font-medium">
            Satıcılar
          </h2>
          <button
            type="button"
            disabled={ordered.length === 0}
            onClick={() =>
              downloadCsv(
                `takip-urun-saticilar-${product.productRef}.csv`,
                ordered.map((s) => ({
                  Sıra: s.current?.rank ?? '',
                  Satıcı: s.sellerName,
                  'Satıcı No': s.sellerRef ?? '',
                  Fiyat: s.current?.price ? (Number(s.current.price) / 100).toFixed(2) : '',
                  'Müşteri Fiyatı': s.current?.finalPrice
                    ? (Number(s.current.finalPrice) / 100).toFixed(2)
                    : '',
                  Kampanya:
                    s.current?.hasPromotion === null || !s.current
                      ? ''
                      : s.current.hasPromotion
                        ? (s.current.promotionText ?? 'var')
                        : 'yok',
                  Stok: s.current?.offeredStock ?? '',
                  'Satıcı Puanı': s.current?.sellerRating ?? '',
                  'Termin (gün)': s.current?.dispatchTime ?? '',
                  Durum: s.current ? 'teklifte' : 'çekilmiş',
                  'İlk Görülme': s.firstSeenAt ? formatDateTime(s.firstSeenAt) : '',
                  'Son Görülme': s.lastSeenAt ? formatDateTime(s.lastSeenAt) : '',
                })),
              )
            }
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
          >
            Excel&apos;e Aktar
          </button>
        </div>

        {ordered.length === 0 ? (
          <EmptyState
            message="Bu ürün için henüz satıcı gözlemi yok."
            reason="ScrapeCompetitors işi çalıştığında dolar (varsayılan kapalı — Ayarlar'dan açılmalı)."
          />
        ) : (
          <TableFrame maxHeight="60vh">
            <table className="w-full text-xs">
              <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
                <tr>
                  <th className="px-2 py-1">Sıra</th>
                  <th className="px-2 py-1">Satıcı</th>
                  <th className="px-2 py-1">Fiyat</th>
                  <th className="px-2 py-1">Değişim</th>
                  <th className="px-2 py-1">Müşteri Fiyatı</th>
                  <th className="px-2 py-1">Kampanya</th>
                  <th className="px-2 py-1">Stok</th>
                  <th className="px-2 py-1">Puan</th>
                  <th className="px-2 py-1">Termin</th>
                  <th className="px-2 py-1">Son Görülme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {ordered.map((s) => {
                  const delta = priceDelta(s);
                  const isOpen = expanded === s.key;
                  return [
                    <tr key={s.key} className={s.current ? undefined : 'row-muted'}>
                      <td className="px-2 py-1">{s.current?.rank ?? '—'}</td>
                      <td className="px-2 py-1">
                        {/* A real button, not a row `onClick` (doc 15 §3.7: never a div/tr with
                            onClick as the only way to trigger it). */}
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : s.key)}
                          aria-expanded={isOpen}
                          className="text-left hover:underline"
                        >
                          {s.sellerName || '(isimsiz)'}
                        </button>
                        {!s.current && <span className="ml-1 text-(--color-muted)">· teklifte değil</span>}
                      </td>
                      <td className="px-2 py-1">
                        {formatMoney(s.current?.price ? BigInt(s.current.price) : null)}
                      </td>
                      <td className="px-2 py-1">
                        {delta ? (
                          <span className={delta.up ? 'text-(--color-danger)' : 'text-(--color-success)'}>
                            {delta.up ? '▲' : '▼'} {formatMoney(delta.kurus)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {formatMoney(s.current?.finalPrice ? BigInt(s.current.finalPrice) : null)}
                      </td>
                      <td className="px-2 py-1" title={s.current?.promotionText ?? undefined}>
                        {promotionCell(s.current)}
                      </td>
                      <td className="px-2 py-1">
                        {s.current?.offeredStock === null || s.current === null
                          ? '—'
                          : formatNumber(s.current.offeredStock)}
                      </td>
                      <td className="px-2 py-1">
                        {s.current?.sellerRating === null || s.current === null
                          ? '—'
                          : s.current.sellerRating.toFixed(1)}
                      </td>
                      <td className="px-2 py-1">
                        {s.current?.dispatchTime === null || s.current === null
                          ? '—'
                          : `${formatNumber(s.current.dispatchTime)} gün`}
                      </td>
                      <td className="px-2 py-1">
                        <Ago at={s.lastSeenAt} />
                      </td>
                    </tr>,
                    isOpen && (
                      <tr key={`${s.key}-history`}>
                        <td colSpan={10} className="bg-(--color-hover) px-4 py-2">
                          <div className="mb-1 text-xs text-(--color-muted)">
                            {s.sellerName || '(isimsiz)'} · bu satıcının pencere içindeki bakışları
                            {s.unverifiedKey && ' · satıcı numarası okunamadı, satırlar isme göre gruplandı'}
                          </div>
                          {/* Bu iç tablo bir denetim kaydı — geçmişte hangi bakışta ne olduğu
                              (doc 15 §3.3: "Absolute time is correct only where the exact instant
                              is the point"), tıpkı `/listings/[id]`'nin Fiyat Geçmişi'nin mutlak
                              zaman kullanmaya devam etmesi gibi. */}
                          <table className="w-full text-xs">
                            <tbody className="divide-y divide-(--color-border)">
                              {[...s.points].reverse().map((p) => (
                                <tr key={p.observedAt}>
                                  <td className="py-0.5 pr-4">{formatDateTime(p.observedAt)}</td>
                                  <td className="py-0.5 pr-4">Sıra {p.rank ?? '—'}</td>
                                  <td className="py-0.5 pr-4">
                                    {formatMoney(p.price ? BigInt(p.price) : null)}
                                  </td>
                                  <td className="py-0.5 pr-4">
                                    Stok {p.offeredStock === null ? '—' : formatNumber(p.offeredStock)}
                                  </td>
                                  <td className="py-0.5 pr-4">{promotionCell(p)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </TableFrame>
        )}
      </section>

      {/* Bakış geçmişi — bu iç tablo da bir denetim kaydı, mutlak zaman kalıyor (yukarıdaki not). */}
      <section className="rounded border border-(--color-border) p-4" aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-medium">
          Buybox Fiyat Geçmişi
        </h2>
        <BuyboxChart looks={looks} sellers={sellers} />
        {looks.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              message="Henüz bakış yok."
              reason="ScrapeCompetitors işi bu ürünü ilk taradığında burası dolar."
            />
          </div>
        ) : (
          <TableFrame className="mt-3" maxHeight="40vh">
            <table className="w-full text-xs">
              <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
                <tr>
                  <th className="px-2 py-1">Bakış</th>
                  <th className="px-2 py-1">Durum</th>
                  <th className="px-2 py-1">Satıcı Sayısı</th>
                  <th className="px-2 py-1">Buybox Fiyat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {[...looks].reverse().map((l) => (
                  <tr key={l.observedAt} className={l.status === 'ok' ? '' : 'row-danger'}>
                    <td className="px-2 py-1">{formatDateTime(l.observedAt)}</td>
                    <td className="px-2 py-1">{STATUS_LABELS[l.status] ?? l.status}</td>
                    <td className="px-2 py-1">{l.status === 'ok' ? formatNumber(l.offers) : '—'}</td>
                    <td className="px-2 py-1">{formatMoney(l.buyboxPrice ? BigInt(l.buyboxPrice) : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </section>
    </div>
  );
}
