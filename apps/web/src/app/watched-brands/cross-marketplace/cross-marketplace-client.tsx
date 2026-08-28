'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadCsv } from '@/lib/csv';
import { formatNumber, formatPercent } from '@/lib/format';

/**
 * Pazaryeri eşleşmesi (doc 06 §12.5, Faz 8).
 *
 * Markanın aynı ürününün iki pazaryerindeki karşılıklarını gösterir. Eşleşme **yalnızca
 * barkodla** kurulur: ada, markaya, gramaja bakan hiçbir tahmin yok. Marka sahibi bu satırlara
 * göre hareket eder, ve yanlış bir satır eksik bir satırdan kötüdür.
 *
 * Bu yüzden ekranın yarısı kapsama oranıdır. 40 eşleşme, 564 ürünlük bir markada bambaşka bir
 * şeydir 40 ürünlük bir markada olduğundan; barkodu bilinmeyen ürünler eşleşmenin dışında kalır
 * ve **sayı olarak** görünür. Eksik, doldurulmaz — gösterilir.
 */

interface Coverage {
  total: number;
  resolved: number;
  statedNone: number;
  failed: number;
  pending: number;
}

interface Match {
  barcode: string;
  leftId: string;
  leftProductRef: string;
  leftLabel: string;
  leftUrl: string;
  rightId: string;
  rightProductRef: string;
  rightLabel: string;
  rightUrl: string;
}

interface Response {
  left: { marketplaceCode: string; coverage: Coverage };
  right: { marketplaceCode: string; coverage: Coverage };
  matches: Match[];
  truncated: boolean;
}

const MARKETPLACE_LABELS: Record<string, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
};

function marketplaceLabel(code: string): string {
  return MARKETPLACE_LABELS[code] ?? code;
}

function CoverageCard({ code, coverage }: { readonly code: string; readonly coverage: Coverage }) {
  const share = coverage.total === 0 ? 0 : coverage.resolved / coverage.total;
  return (
    <div className="rounded border border-(--color-border) p-3">
      <h3 className="text-sm font-medium">{marketplaceLabel(code)}</h3>
      <p className="mt-1 text-2xl tabular-nums">{formatPercent(share)}</p>
      <p className="text-xs text-(--color-muted)">
        {formatNumber(coverage.resolved)} / {formatNumber(coverage.total)} üründe barkod biliniyor
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-(--color-muted)">Sayfa barkod bildirmedi</dt>
        <dd className="tabular-nums">{formatNumber(coverage.statedNone)}</dd>
        <dt className="text-(--color-muted)">Sorulup yanıt alınamadı</dt>
        <dd className="tabular-nums">{formatNumber(coverage.failed)}</dd>
        <dt className="text-(--color-muted)">Henüz sorulmadı</dt>
        <dd className="tabular-nums">{formatNumber(coverage.pending)}</dd>
      </dl>
    </div>
  );
}

export function CrossMarketplaceClient() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/brand-reports/cross-marketplace');
      if (!res.ok) throw new Error('Eşleşmeler okunamadı.');
      setData((await res.json()) as Response);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const matches = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase('tr');
    if (needle === '' || !data) return data?.matches ?? [];
    return data.matches.filter(
      (m) =>
        m.barcode.includes(needle) ||
        m.leftLabel.toLocaleLowerCase('tr').includes(needle) ||
        m.rightLabel.toLocaleLowerCase('tr').includes(needle),
    );
  }, [data, filter]);

  const exportCsv = () => {
    if (!data) return;
    const leftName = marketplaceLabel(data.left.marketplaceCode);
    const rightName = marketplaceLabel(data.right.marketplaceCode);
    downloadCsv(
      'pazaryeri-eslesmesi.csv',
      matches.map((m) => ({
        Barkod: m.barcode,
        [`${leftName} ürün`]: m.leftLabel,
        [`${leftName} kodu`]: m.leftProductRef,
        [`${rightName} ürün`]: m.rightLabel,
        [`${rightName} kodu`]: m.rightProductRef,
      })),
    );
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Pazaryeri Eşleşmesi</h1>
        <p className="mt-1 max-w-3xl text-sm text-(--color-muted)">
          Aynı ürünün iki pazaryerindeki karşılıkları. Eşleşme <strong>yalnızca barkodla</strong>{' '}
          kurulur — ada, markaya veya gramaja bakan hiçbir tahmin yoktur, çünkü bu satırlara göre
          ihtar yazılır ve yanlış bir satır eksik bir satırdan kötüdür. Barkodu bilinmeyen ürünler
          burada görünmez; kaç tane oldukları aşağıda yazar.
        </p>
      </header>

      {error && (
        <div className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-2 text-sm">
          {error}
        </div>
      )}

      {data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            <CoverageCard code={data.left.marketplaceCode} coverage={data.left.coverage} />
            <CoverageCard code={data.right.marketplaceCode} coverage={data.right.coverage} />
          </section>

          {data.left.coverage.pending + data.right.coverage.pending > 0 && (
            <p className="text-xs text-(--color-muted)">
              {formatNumber(data.left.coverage.pending + data.right.coverage.pending)} ürünün barkodu
              henüz sorulmadı. <strong>Barkod Tamamlama</strong> işi bunları saatte bir, azar azar
              tamamlar — bir markanın tamamı günler sürer, çünkü ürün başına bir sayfa okunur.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Barkod veya ürün adı"
              className="rounded border border-(--color-border) px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={matches.length === 0}
              className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-50"
            >
              Excel'e aktar
            </button>
            <span className="text-xs text-(--color-muted)">
              {formatNumber(matches.length)} eşleşme
              {data.truncated ? ' (liste kısaltıldı)' : ''}
            </span>
          </div>

          {matches.length === 0 && !loading && (
            <p className="text-sm text-(--color-muted)">
              Henüz eşleşme yok. İki pazaryerinde de barkodu bilinen ortak bir ürün gerekir.
            </p>
          )}

          {matches.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs text-(--color-muted)">
                  <tr>
                    <th className="px-2 py-1">Barkod</th>
                    <th className="px-2 py-1">{marketplaceLabel(data.left.marketplaceCode)}</th>
                    <th className="px-2 py-1">{marketplaceLabel(data.right.marketplaceCode)}</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={`${m.leftId}-${m.rightId}`} className="border-t border-(--color-border)">
                      <td className="px-2 py-1 tabular-nums">{m.barcode}</td>
                      <td className="px-2 py-1">
                        <a className="underline" href={m.leftUrl} target="_blank" rel="noopener noreferrer">
                          {m.leftLabel}
                        </a>
                        <span className="ml-1 text-xs text-(--color-muted)">{m.leftProductRef}</span>
                      </td>
                      <td className="px-2 py-1">
                        <a className="underline" href={m.rightUrl} target="_blank" rel="noopener noreferrer">
                          {m.rightLabel}
                        </a>
                        <span className="ml-1 text-xs text-(--color-muted)">{m.rightProductRef}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
