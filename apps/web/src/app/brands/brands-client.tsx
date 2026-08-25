'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import { downloadCsv } from '@/lib/csv';
import { formatNumber } from '@/lib/format';

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
 */
export function BrandsClient() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const filtered = brands.filter((b) => b.name.toLowerCase().includes(text.toLowerCase()));
  const paged = usePagedRows(filtered, { resetKey: text });

  useEffect(() => {
    fetch('/api/brands')
      .then((r) => r.json())
      .then((d: { brands: Brand[] }) => setBrands(d.brands))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Markalar</h1>
        <button
          type="button"
          disabled={brands.length === 0}
          onClick={() =>
            downloadCsv(
              'markalar.csv',
              brands.map((b) => ({ Marka: b.name, Pazaryeri: b.marketplaceCode, Ürün: b.listingCount })),
            )
          }
          className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
        >
          Excel&apos;e Aktar
        </button>
      </div>

      <p className="max-w-2xl text-sm text-(--color-muted)">
        Bugün yalnızca Trendyol için doldurulur — Hepsiburada&apos;nın listeleme servisi marka
        bilgisi vermiyor (api-references §2.4).
      </p>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Marka ara…"
        className="w-64 rounded border border-(--color-border) px-2 py-1 text-sm"
      />

      <TableFrame>
        <table className="w-full text-sm">
          <thead className={`${STICKY_HEAD} bg-(--color-hover) text-left text-xs uppercase text-(--color-muted)`}>
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
                <td className="px-2 py-1">{b.marketplaceCode}</td>
                <td className="px-2 py-1 text-right">{formatNumber(b.listingCount)}</td>
              </tr>
            ))}
            {paged.rows.length === 0 && !loading && (
              <tr>
                <td colSpan={3} className="px-2 py-6 text-center text-(--color-muted)">
                  {brands.length === 0 ? 'Henüz marka bilgisi yok.' : 'Aramayla eşleşen marka yok.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>

      <Pagination state={paged} label="marka" />
    </div>
  );
}
