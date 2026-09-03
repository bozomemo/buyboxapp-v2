'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PriceChart } from '@/components/price-chart';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { lookAnnotations } from '@/lib/price-chart-series';
import { marketplaceProductUrl } from '@/lib/product-url';

interface SellerPoint {
  observedAt: number;
  rank: number | null;
  price: string | null;
  finalPrice: string | null;
  offeredStock: number | null;
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

const STATUS_LABELS: Record<string, string> = {
  ok: 'Başarılı',
  parseFailed: 'Sayfa okunamadı',
  fetchFailed: 'Sayfaya ulaşılamadı',
};

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

  useEffect(() => {
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

  if (error) return <p className="text-(--color-danger)">{error}</p>;
  if (!detail) return <p className="text-(--color-muted)">Yükleniyor…</p>;

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
            <span className="ml-2 row-muted rounded px-1 text-xs">Takip duraklatıldı</span>
          )}
        </p>
      </div>

      {/* Şu An */}
      <section className="rounded border border-(--color-border) p-4">
        <h2 className="mb-3 text-lg font-medium">Şu An</h2>
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
              {product.lastScrapedAt ? formatDateTime(product.lastScrapedAt) : 'henüz taranmadı'}
              {latestLook && latestLook.status !== 'ok' && (
                <span className="ml-1 text-(--color-danger)">
                  ⚠ {STATUS_LABELS[latestLook.status] ?? latestLook.status}
                </span>
              )}
            </div>
            {latestLook && (
              <div className="text-xs text-(--color-muted)">
                son değişiklik: {formatDateTime(latestLook.observedAt)}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Satıcılar */}
      <section className="rounded border border-(--color-border) p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Satıcılar</h2>
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
                  Stok: s.current?.offeredStock ?? '',
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

        <TableFrame maxHeight="60vh">
          <table className="w-full text-xs">
            <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
              <tr>
                <th className="px-2 py-1">Sıra</th>
                <th className="px-2 py-1">Satıcı</th>
                <th className="px-2 py-1">Fiyat</th>
                <th className="px-2 py-1">Değişim</th>
                <th className="px-2 py-1">Müşteri Fiyatı</th>
                <th className="px-2 py-1">Stok</th>
                <th className="px-2 py-1">Son Görülme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {ordered.map((s) => {
                const delta = priceDelta(s);
                const isOpen = expanded === s.key;
                return [
                  <tr
                    key={s.key}
                    onClick={() => setExpanded(isOpen ? null : s.key)}
                    className={`cursor-pointer hover:bg-(--color-hover) ${s.current ? '' : 'row-muted'}`}
                  >
                    <td className="px-2 py-1">{s.current?.rank ?? '—'}</td>
                    <td className="px-2 py-1">
                      {s.sellerName || '(isimsiz)'}
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
                    <td className="px-2 py-1">
                      {s.current?.offeredStock === null || s.current === null
                        ? '—'
                        : formatNumber(s.current.offeredStock)}
                    </td>
                    <td className="px-2 py-1">{s.lastSeenAt ? formatDateTime(s.lastSeenAt) : '—'}</td>
                  </tr>,
                  isOpen && (
                    <tr key={`${s.key}-history`}>
                      <td colSpan={7} className="bg-(--color-hover) px-4 py-2">
                        <div className="mb-1 text-xs text-(--color-muted)">
                          {s.sellerName || '(isimsiz)'} · bu satıcının pencere içindeki bakışları
                          {s.unverifiedKey && ' · satıcı numarası okunamadı, satırlar isme göre gruplandı'}
                        </div>
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
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
              {ordered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-(--color-muted)">
                    Bu ürün için henüz satıcı gözlemi yok. ScrapeCompetitors işi çalıştığında dolar
                    (varsayılan kapalı — Ayarlar&apos;dan açılmalı).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableFrame>
      </section>

      {/* Bakış geçmişi */}
      <section className="rounded border border-(--color-border) p-4">
        <h2 className="mb-3 text-lg font-medium">Buybox Fiyat Geçmişi</h2>
        <BuyboxChart looks={looks} sellers={sellers} />
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
              {looks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-(--color-muted)">
                    Henüz bakış yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableFrame>
      </section>
    </div>
  );
}
