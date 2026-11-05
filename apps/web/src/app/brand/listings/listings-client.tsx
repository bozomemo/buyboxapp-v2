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
 * into text. The _birim buybox_ column is the one divided figure in the system and it is display
 * only — every verdict multiplies the threshold instead (doc 17 §2.2). (It was labelled _birim
 * fiyat_ until 2026-11-03, when _Birim Fiyat_ became the product's price to resellers.)
 *
 * The last three columns are the **reseller profit estimate** (doc 17 §8): what the buybox holder
 * plausibly earns, from the product's unit price and desi, the desi table and the commission
 * tariff. Reporting only. A row that cannot be estimated says which input is missing.
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
  profit: {
    commissionRate: number;
    commission: string;
    cargo: string;
    operation: string;
    fixedSaleFee: string;
    cost: string;
    profit: string;
    profitPct: number;
    breakEvenPrice: string | null;
  } | null;
  profitMissing: ProfitMissing | null;
}

type ProfitMissing =
  | 'noSettings'
  | 'noUnitPrice'
  | 'noDesi'
  | 'noDesiBand'
  | 'noTariff'
  | 'packCard'
  | 'priceOutsideTariff'
  | 'noBuyboxPrice';

/** Short cell text, then the sentence that says what to do about it. */
const PROFIT_MISSING: Record<ProfitMissing, readonly [string, string]> = {
  noSettings: ['ayar yok', 'Kâr Ayarları ekranında desi tablosu ve sabit bedel kaydedilmemiş.'],
  noUnitPrice: ['birim fiyat yok', 'Stok ürününe birim fiyat girilmemiş.'],
  noDesi: ['desi yok', 'Stok ürününe desi girilmemiş.'],
  noDesiBand: ['desi bandı yok', 'Bu desi, Kâr Ayarları’ndaki desi tablosunun hiçbir satırına düşmüyor.'],
  noTariff: ['tarife yok', 'Bu ürünün barkoduyla eşleşen, bugün geçerli bir komisyon tarifesi yüklenmemiş.'],
  packCard: [
    'paket kartı',
    'Komisyon tarifesi tek ürün içindir; paket kartlarında kâr şimdilik hesaplanmıyor.',
  ],
  priceOutsideTariff: ['tarife dışı', 'Buybox fiyatı tarifenin hiçbir kademesine düşmüyor.'],
  noBuyboxPrice: ['buybox yok', 'Kartta okunmuş bir buybox fiyatı yok.'],
};

function profitTitle(p: NonNullable<Listing['profit']>): string {
  return [
    `Komisyon %${String(p.commissionRate).replace('.', ',')}: ${formatMoney(BigInt(p.commission))}`,
    `Kargo: ${formatMoney(BigInt(p.cargo))}`,
    `Operasyon: ${formatMoney(BigInt(p.operation))}`,
    `Sabit satış bedeli: ${formatMoney(BigInt(p.fixedSaleFee))}`,
    `Birim fiyat: ${formatMoney(BigInt(p.cost))}`,
  ].join('\n');
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
        breadcrumb={[{ label: 'Marka Denetimi' }, { label: 'İlanlar' }]}
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
                    <th className="p-2 text-right" title="Buybox fiyatı ÷ çarpan — yalnızca okumak için">
                      Birim buybox
                    </th>
                    <th className="p-2 text-right">PSF</th>
                    <th className="p-2 text-right">Min</th>
                    <th className="p-2 text-right">Üst sınır</th>
                    <th className="p-2">Durum</th>
                    <th
                      className="p-2 text-right"
                      title="Komisyon tarifesine göre, buybox fiyatının düştüğü kademe"
                    >
                      Komisyon
                    </th>
                    <th
                      className="p-2 text-right"
                      title="Buybox satıcısının tahmini kârı — raporlama amaçlı tahmindir"
                    >
                      Tahmini kâr
                    </th>
                    <th className="p-2 text-right" title="Satıcının kâr etmeye başladığı en düşük fiyat">
                      0 kâr fiyatı
                    </th>
                    <th className="p-2 text-right">Satıcı</th>
                    <th className="p-2">Son bakış</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-(--color-border)">
                      <td className="p-2">
                        {/* kit-exempt: favourite star toggle, a pressed icon state the kit has no control for */}
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
                      {row.profit ? (
                        <>
                          <td className="p-2 text-right tabular-nums">
                            %{String(row.profit.commissionRate).replace('.', ',')}
                          </td>
                          <td
                            className={`p-2 text-right tabular-nums ${BigInt(row.profit.profit) < 0n ? 'text-(--color-danger) font-medium' : ''}`}
                            title={profitTitle(row.profit)}
                          >
                            {money(row.profit.profit)}
                            <span className="ml-1 text-xs text-(--color-muted)">
                              %{row.profit.profitPct.toFixed(1).replace('.', ',')}
                            </span>
                          </td>
                          <td className="p-2 text-right tabular-nums">{money(row.profit.breakEvenPrice)}</td>
                        </>
                      ) : (
                        <td
                          colSpan={3}
                          className="p-2 text-right text-xs text-(--color-muted)"
                          title={row.profitMissing ? PROFIT_MISSING[row.profitMissing][1] : undefined}
                        >
                          {row.profitMissing ? PROFIT_MISSING[row.profitMissing][0] : '—'}
                        </td>
                      )}
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
              <strong>Birim buybox</strong> yalnızca okumak içindir: buybox fiyatının çarpana bölünmüş,
              yuvarlanmış hâli. Karar verirken sistem bölmez — eşiği çarpar, yani ×6 bir kart tam olarak
              PSF&apos;nin altı katıyla karşılaştırılır. <strong>Durum</strong> son başarılı bakışa aittir;
              okunamayan bir sayfa &quot;bilinmiyor&quot;dur, ihlal değil. <strong>Tahmini kâr</strong>,
              buybox satıcısının bu fiyattan ne kazandığının tahminidir: buybox fiyatı − komisyon − kargo −
              operasyon − sabit satış bedeli − birim fiyat. Ayrıntı için hücrenin üzerine gelin; desi tablosu
              ve komisyon tarifesi{' '}
              <Link className="underline" href="/brand/profit">
                Kâr Ayarları
              </Link>{' '}
              ekranındadır.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}
