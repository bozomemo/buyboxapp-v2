'use client';

/**
 * İlanlar (marka) — the cards the manager actually watches (doc 17 §4.1, doc 06 §12.6).
 *
 * A brand's catalogue is mostly noise: the product owner's example is 1,000 Trendyol cards of
 * which about 50 really sell. So this screen is not the catalogue — it is the cards that are
 * **linked to one of your products** or that you **starred**, and it is exactly the set
 * `SweepListedProducts` keeps fresh every half hour (doc 07 §7.5).
 *
 * The two halves of the set answer different questions and the grid says which is which. A
 * linked card has a PSF and is judged against its band; a starred card that is nobody's product
 * — a competitor's listing you want in view — has no band, and its band columns show _—_ rather
 * than a verdict it cannot have.
 *
 * Money is kuruş as decimal strings over the wire and `bigint` here; only `formatMoney` turns it
 * into text. The _birim fiyat_ column is the one divided figure in the system and it is display
 * only — every verdict multiplies the threshold instead (doc 17 §2.2).
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE, Pagination, STICKY_HEAD, TableFrame } from '@/components/table';
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Section,
  Select,
  TextInput,
} from '@/components/ui';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { marketplaceProductUrl } from '@/lib/product-url';

type BandStatus = 'inBand' | 'belowMin' | 'aboveMax' | 'unknown';

interface Listing {
  id: string;
  marketplaceCode: string;
  productRef: string;
  productUrl: string | null;
  label: string;
  isActive: boolean;
  isFavourite: boolean;
  lastScrapedAt: number | null;
  sellerCount: number;
  buyboxSeller: string | null;
  buyboxPrice: string | null;
  buyboxPriceSource: 'finalPrice' | 'price' | null;
  unitPrice: string | null;
  brandProduct: { id: string; name: string; unitMultiplier: number; isPrimary: boolean } | null;
  referencePrice: string | null;
  minPrice: string | null;
  upperBound: string | null;
  upperBoundIsReferencePrice: boolean;
  bandStatus: BandStatus;
}

const STATUS_LABELS: Record<BandStatus, string> = {
  inBand: 'Aralıkta',
  belowMin: 'Min altında',
  aboveMax: 'Max üstünde',
  unknown: 'Bilinmiyor',
};

/** In-band is deliberately quiet: only a breach earns colour, so a screenful of green is not noise. */
const STATUS_CLASS: Record<BandStatus, string> = {
  inBand: 'text-(--color-muted)',
  belowMin: 'text-(--color-danger) font-medium',
  aboveMax: 'text-(--color-warning) font-medium',
  unknown: 'text-(--color-muted)',
};

function money(value: string | null): string {
  return value === null ? '—' : formatMoney(BigInt(value));
}

export function BrandListingsClient() {
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [marketplace, setMarketplace] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const params = useCallback(() => {
    const search = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (query.trim() !== '') search.set('text', query.trim());
    if (marketplace !== '') search.set('marketplaceCode', marketplace);
    return search;
  }, [page, pageSize, query, marketplace]);

  const load = useCallback(() => {
    setLoadError(null);
    fetch(`/api/brand/listings?${params().toString()}`)
      .then((r) => r.json())
      .then((data: { listings?: Listing[]; total?: number; error?: string }) => {
        if (data.error) {
          setLoadError(data.error);
          return;
        }
        setRows(data.listings ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'İlanlar okunamadı.'));
  }, [params]);

  useEffect(load, [load]);

  async function toggleFavourite(row: Listing) {
    setBusy(row.id);
    try {
      await fetch('/api/tracked-products/favourite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, isFavourite: !row.isFavourite }),
      });
      load();
    } finally {
      setBusy(null);
    }
  }

  const breaches = (rows ?? []).filter(
    (row) => row.bandStatus === 'belowMin' || row.bandStatus === 'aboveMax',
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="İlanlar"
        description="Ürünlerinize bağlı kartlar ve yıldızladığınız kartlar. Yarım saatte bir taranır; fiyatlar bandınızla karşılaştırılır."
      />

      <Section
        id="brand-listings"
        title="Kartlar"
        action={
          <a
            className="text-sm underline"
            href={`/api/brand/listings?${params().toString()}&format=csv`}
            download
          >
            Excel&apos;e aktar
          </a>
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Ara (kart adı veya ürün kodu)">
            <TextInput
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setQuery(text);
                  setPage(0);
                }
              }}
              placeholder="Kart adı ya da ürün kodu"
            />
          </Field>
          <Field label="Pazaryeri">
            <Select
              value={marketplace}
              onChange={(e) => {
                setMarketplace(e.target.value);
                setPage(0);
              }}
              options={[
                { value: '', label: 'Hepsi' },
                { value: 'trendyol', label: 'Trendyol' },
                { value: 'hepsiburada', label: 'Hepsiburada' },
              ]}
            />
          </Field>
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setQuery(text);
              setPage(0);
            }}
          >
            Ara
          </Button>
        </div>

        {rows !== null && rows.length > 0 && (
          <p className="mb-2 text-sm">
            {breaches.length === 0 ? (
              <span className="text-(--color-muted)">
                Bu sayfadaki kartların hiçbiri bandın dışında değil.
              </span>
            ) : (
              <span className="text-(--color-warning)">
                Bu sayfada <strong>{formatNumber(breaches.length)}</strong> kart bandın dışında.
              </span>
            )}{' '}
            <span className="text-(--color-muted)">
              Bir kartın son bakışı eskiyse durum o eski bakışa aittir — tarama turunu İşler ekranından
              görebilirsiniz.
            </span>
          </p>
        )}

        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : rows === null ? (
          <LoadingState message="İlanlar yükleniyor…" skeletonRows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            message={
              query.trim() === '' && marketplace === '' ? 'Henüz ilan yok.' : 'Bu filtreye uyan ilan yok.'
            }
            reason={
              query.trim() === '' && marketplace === ''
                ? 'Stok ekranından bir ürüne pazaryeri kartı bağlayın ya da Takip Edilen Ürünler ekranından bir kartı yıldızlayın.'
                : 'Aramayı ya da pazaryeri filtresini değiştirin.'
            }
          />
        ) : (
          <>
            <TableFrame>
              <table className="w-full text-sm">
                <thead className={STICKY_HEAD}>
                  <tr className="text-left">
                    <th className="p-2" aria-label="Favori" />
                    <th className="p-2">Kart</th>
                    <th className="p-2">Stok ürünü</th>
                    <th className="p-2">Çarpan</th>
                    <th className="p-2">Buybox satıcı</th>
                    <th className="p-2 text-right">Buybox fiyat</th>
                    <th className="p-2 text-right">Birim fiyat</th>
                    <th className="p-2 text-right">PSF</th>
                    <th className="p-2 text-right">Min</th>
                    <th className="p-2 text-right">Üst sınır</th>
                    <th className="p-2">Durum</th>
                    <th className="p-2 text-right">Satıcı</th>
                    <th className="p-2">Son bakış</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-(--color-border)">
                      <td className="p-2">
                        <button
                          type="button"
                          disabled={busy === row.id}
                          onClick={() => void toggleFavourite(row)}
                          aria-label={row.isFavourite ? 'Favoriden çıkar' : 'Favorile'}
                          title={row.isFavourite ? 'Favoriden çıkar' : 'Favorile'}
                          className={row.isFavourite ? 'text-(--color-accent)' : 'text-(--color-muted)'}
                        >
                          {row.isFavourite ? '★' : '☆'}
                        </button>
                      </td>
                      <td className="p-2">
                        <span>{row.label}</span>
                        {(() => {
                          const pageUrl = marketplaceProductUrl(row.marketplaceCode, row.productUrl);
                          return pageUrl ? (
                            <a
                              href={pageUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="Pazaryerindeki ürün sayfası"
                              className="ml-1 text-(--color-muted) hover:text-(--color-accent)"
                            >
                              ↗
                            </a>
                          ) : null;
                        })()}
                        <span className="ml-2 text-xs text-(--color-muted)">{row.marketplaceCode}</span>
                        {!row.isActive && (
                          <span className="ml-2 text-xs text-(--color-muted)">· duraklatıldı</span>
                        )}
                      </td>
                      <td className="p-2">
                        {row.brandProduct ? (
                          <Link className="underline" href={`/brand/products/${row.brandProduct.id}`}>
                            {row.brandProduct.name}
                          </Link>
                        ) : (
                          // A starred card that is nobody's product. Said plainly, because it is
                          // why the band columns beside it are empty.
                          <span className="text-xs text-(--color-muted)">Bağlı değil (favori)</span>
                        )}
                      </td>
                      <td className="p-2 tabular-nums">
                        {row.brandProduct ? `×${row.brandProduct.unitMultiplier}` : '—'}
                      </td>
                      <td className="p-2">{row.buyboxSeller ?? '—'}</td>
                      <td className="p-2 text-right tabular-nums">
                        {money(row.buyboxPrice)}
                        {/* Which field was judged: a coupon price and a list price are different
                            facts, and the band is about what the customer pays (doc 17 §5.1). */}
                        {row.buyboxPriceSource === 'finalPrice' && (
                          <span className="ml-1 text-xs text-(--color-muted)" title="Kupon sonrası fiyat">
                            kuponlu
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">{money(row.unitPrice)}</td>
                      <td className="p-2 text-right tabular-nums">{money(row.referencePrice)}</td>
                      <td className="p-2 text-right tabular-nums">{money(row.minPrice)}</td>
                      <td className="p-2 text-right tabular-nums">
                        {money(row.upperBound)}
                        {row.upperBoundIsReferencePrice && row.upperBound !== null && (
                          <span
                            className="ml-1 text-xs text-(--color-muted)"
                            title="Max girilmemiş, üst sınır PSF"
                          >
                            PSF
                          </span>
                        )}
                      </td>
                      <td className={`p-2 ${STATUS_CLASS[row.bandStatus]}`}>
                        {row.brandProduct ? STATUS_LABELS[row.bandStatus] : '—'}
                      </td>
                      <td className="p-2 text-right tabular-nums">{formatNumber(row.sellerCount)}</td>
                      <td className="p-2 text-xs text-(--color-muted)">
                        {row.lastScrapedAt === null ? 'hiç' : formatDateTime(row.lastScrapedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableFrame>
            <Pagination
              state={{
                page,
                pageSize,
                total,
                setPage,
                setPageSize: (size) => {
                  setPageSize(size);
                  setPage(0);
                },
              }}
              label="ilan"
            />
            <p className="mt-2 text-xs text-(--color-muted)">
              <strong>Birim fiyat</strong> yalnızca okumak içindir: buybox fiyatının çarpana bölünmüş,
              yuvarlanmış hâli. Karar verirken sistem bölmez — eşiği çarpar, yani ×6 bir kart tam olarak
              PSF&apos;nin altı katıyla karşılaştırılır. <strong>Durum</strong> son başarılı bakışa aittir;
              okunamayan bir sayfa &quot;bilinmiyor&quot;dur, ihlal değil.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
