'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';

interface Observation {
  status: 'ok' | 'parseFailed' | 'fetchFailed';
  rank: number | null;
  sellerName: string | null;
  price: string | null;
  finalPrice: string | null;
  observedAt: number;
}

interface TrackedProduct {
  id: string;
  marketplaceCode: string;
  productUrl: string;
  label: string;
  isActive: boolean;
  addedAt: number;
  latest: Observation[];
}

/** The rank-1 offer from the latest look, if the look succeeded and found one. */
function buyboxOffer(p: TrackedProduct): Observation | undefined {
  return p.latest.find((o) => o.status === 'ok' && o.rank === 1);
}

/**
 * Rakip ürün takibi — kendi satmadığımız ürünler (doc 06 §12.2, customer feedback 2026-08-25).
 * v1: link ile ekleme. Reprice/ObserveBuybox bu ekranın verisini hiç görmez — ayrı bir tablo
 * (`tracked_products`), listings değil; bkz. `packages/db/src/schema/sqlite.ts`'teki
 * `trackedProducts` yorum satırı.
 */
export function TrackedProductsClient() {
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch('/api/tracked-products')
      .then((r) => r.json())
      .then((d: { products: TrackedProduct[] }) => setProducts(d.products))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tracked-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link, label }),
      });
      if (res.ok) {
        setLink('');
        setLabel('');
        load();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Eklenemedi.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Bu ürünü takipten çıkar?')) return;
    await fetch(`/api/tracked-products?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Takip Edilen Ürünler</h1>
        <button
          type="button"
          disabled={products.length === 0}
          onClick={() =>
            downloadCsv(
              'takip-edilen-urunler.csv',
              products.map((p) => {
                const bb = buyboxOffer(p);
                return {
                  Etiket: p.label,
                  Pazaryeri: p.marketplaceCode,
                  Aktif: p.isActive ? 'evet' : 'hayır',
                  'Satıcı Sayısı': p.latest.filter((o) => o.status === 'ok').length,
                  'Buybox Satıcı': bb?.sellerName ?? '',
                  'Buybox Fiyat': bb?.price ? (Number(bb.price) / 100).toFixed(2) : '',
                  'Son Bakış': p.latest[0] ? formatDateTime(p.latest[0].observedAt) : '',
                };
              }),
            )
          }
          className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
        >
          Excel&apos;e Aktar
        </button>
      </div>

      <p className="max-w-2xl text-sm text-(--color-muted)">
        Satmadığımız bir ürünün fiyat/sıra bilgisini izlemek için ürün linkini yapıştırın. Bu liste{' '}
        <strong>raporlamadır</strong> — hiçbir fiyat kararını etkilemez (doc 07 §7&apos;nin ScrapeCompetitors
        izolasyonuyla aynı ilke). Tarama, ScrapeCompetitors işi her çalıştığında (varsayılan kapalı —
        Ayarlar&apos;dan açılmalı) bu listeyi de günceller.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded border border-(--color-border) p-3">
        <label className="flex flex-col text-xs">
          Ürün linki
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.trendyol.com/... veya https://www.hepsiburada.com/..."
            className="w-96 rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs">
          Etiket (opsiyonel)
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Kolay tanımak için bir isim"
            className="w-48 rounded border border-(--color-border) px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy || !link.trim()}
          onClick={() => void add()}
          className="rounded bg-(--color-accent) px-3 py-1.5 text-sm text-(--color-accent-ink) disabled:opacity-40"
        >
          Ekle
        </button>
      </div>
      {error && <p className="text-sm text-(--color-danger)">{error}</p>}

      <TableFrame>
        <table className="w-full text-sm">
          <thead
            className={`${STICKY_HEAD} bg-(--color-hover) text-left text-xs uppercase text-(--color-muted)`}
          >
            <tr>
              <th className="px-2 py-2">Etiket</th>
              <th className="px-2 py-2">Pazaryeri</th>
              <th className="px-2 py-2">Satıcı Sayısı</th>
              <th className="px-2 py-2">Buybox Satıcı</th>
              <th className="px-2 py-2">Buybox Fiyat</th>
              <th className="px-2 py-2">Son Bakış</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {products.map((p) => {
              const bb = buyboxOffer(p);
              const lastLook = p.latest[0];
              return (
                <tr key={p.id}>
                  <td className="px-2 py-1">
                    {/* Etiket detaya gider — ürün sayfasının kendisi ayrı bir bağlantı, çünkü
                        operatörün asıl istediği bütün satıcıların fiyat/stokları (doc 06 §12.2). */}
                    <Link
                      href={`/tracked-products/${p.id}`}
                      className="text-(--color-accent) hover:underline"
                    >
                      {p.label}
                    </Link>
                    <a
                      href={p.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Pazaryerindeki ürün sayfası"
                      className="ml-1 text-(--color-muted) hover:text-(--color-accent)"
                    >
                      ↗
                    </a>
                  </td>
                  <td className="px-2 py-1">{p.marketplaceCode}</td>
                  <td className="px-2 py-1">
                    {formatNumber(p.latest.filter((o) => o.status === 'ok').length)}
                  </td>
                  <td className="px-2 py-1">{bb?.sellerName ?? '—'}</td>
                  <td className="px-2 py-1">{bb?.price ? formatMoney(BigInt(bb.price)) : '—'}</td>
                  <td className="px-2 py-1">
                    {lastLook ? (
                      <span
                        title={
                          lastLook.status !== 'ok' ? `Son bakış başarısız: ${lastLook.status}` : undefined
                        }
                      >
                        {formatDateTime(lastLook.observedAt)}
                        {lastLook.status !== 'ok' && <span className="ml-1 text-(--color-danger)">⚠</span>}
                      </span>
                    ) : (
                      'henüz taranmadı'
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(p.id)}
                      className="text-(--color-muted) hover:text-(--color-danger)"
                    >
                      Kaldır
                    </button>
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-(--color-muted)">
                  Henüz takip edilen ürün yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>
    </div>
  );
}
