'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatNumber } from '@/lib/format';
import { labelOf, MARKETPLACE_LABELS } from '@/lib/labels';

interface Brand {
  id: string;
  marketplaceCode: string;
  name: string;
  listingCount: number;
}

/**
 * Marka bazlı gezinme (doc 06 §12.1, customer feedback 2026-08-25): "markaya basınca o markaya
 * ait ürünler görünmeli". Clicking a row filters `/listings` to that brand — the identical
 * cross-navigation `/stock` already does for a base stock code (doc 06 §4.5).
 *
 * Consistency pass (doc 15 §6, Phase 5): shared kit, six states, translated marketplace label.
 *
 * No `useColumnPrefs` (sweep report §2.4, considered deliberately, not an oversight): the grid is
 * three columns — Marka, Pazaryeri, Ürün — and every one of them is the reason a row exists to
 * click through in the first place. There is nothing to hide that would leave a usable row.
 */
export function BrandsClient() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const filtered = brands.filter((b) => b.name.toLowerCase().includes(text.toLowerCase()));
  const paged = usePagedRows(filtered, { resetKey: text });

  const load = useCallback(() => {
    setLoadError(null);
    fetch('/api/brands')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Markalar yüklenemedi (HTTP ${r.status}).`))))
      .then((d: { brands: Brand[] }) => setBrands(d.brands))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setHasLoadedOnce(true));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasLoadedOnce) {
    return <LoadingState message="Markalar yükleniyor…" skeletonRows={4} />;
  }

  if (loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Markalar"
        description="Bugün yalnızca Trendyol için doldurulur — Hepsiburada'nın listeleme servisi marka bilgisi vermiyor (api-references §2.4)."
        action={
          <button
            type="button"
            disabled={brands.length === 0}
            onClick={() =>
              downloadCsv(
                'markalar.csv',
                brands.map((b) => ({
                  Marka: b.name,
                  Pazaryeri: labelOf(MARKETPLACE_LABELS, b.marketplaceCode),
                  Ürün: b.listingCount,
                })),
              )
            }
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
          >
            Excel&apos;e Aktar
          </button>
        }
      />

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Marka ara…"
        aria-label="Marka ara"
        className="w-64 rounded border border-(--color-border) px-2 py-1 text-sm"
      />

      {brands.length === 0 ? (
        <EmptyState
          message="Henüz marka bilgisi yok."
          reason="Trendyol ilanları içe aktarıldıktan sonra burası dolar."
        />
      ) : (
        <>
          <TableFrame>
            <table className="w-full text-sm">
              <thead
                className={`${STICKY_HEAD} bg-(--color-hover) text-left text-xs uppercase text-(--color-muted)`}
              >
                <tr>
                  <th className="px-2 py-2">Marka</th>
                  <th className="px-2 py-2">Pazaryeri</th>
                  <th className="px-2 py-2 text-right">Ürün</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {paged.rows.map((b) => (
                  <tr key={b.id}>
                    <td className="px-2 py-1">
                      <Link
                        href={`/listings?brandId=${encodeURIComponent(b.id)}&brandName=${encodeURIComponent(b.name)}`}
                        className="text-(--color-accent) hover:underline"
                      >
                        {b.name}
                      </Link>
                    </td>
                    <td className="px-2 py-1">{labelOf(MARKETPLACE_LABELS, b.marketplaceCode)}</td>
                    <td className="px-2 py-1 text-right">{formatNumber(b.listingCount)}</td>
                  </tr>
                ))}
                {paged.rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-6 text-center text-(--color-muted)">
                      Aramayla eşleşen marka yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableFrame>

          <Pagination state={paged} label="marka" />
        </>
      )}
    </div>
  );
}
