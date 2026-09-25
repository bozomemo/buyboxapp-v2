'use client';

/**
 * Stok (marka) — the brand manager's own products (doc 17 §2, doc 06 §12.5).
 *
 * The screen is a list of *products*, not of marketplace cards: one product lives on Trendyol and
 * Hepsiburada at once, and the whole point of the model is that its PSF is stated once, per unit,
 * and every card is compared against it after scaling (doc 17 §2.2). So the grid's own columns
 * are per unit, and the card count is what says whether a product is wired up to anything yet.
 *
 * Amounts are typed as text and parsed on the server by the exact parser — never `parseFloat`,
 * and never a float anywhere: money is bigint kuruş (CLAUDE.md).
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  ConfirmButton,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Section,
  StatusBanner,
  TextInput,
} from '@/components/ui';
import { DEFAULT_PAGE_SIZE, Pagination, STICKY_HEAD, TableFrame } from '@/components/table';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { ImportPanel } from './import-panel';

interface BrandProduct {
  id: string;
  name: string;
  /** Kuruş as strings, per unit. */
  referencePrice: string;
  minPrice: string | null;
  maxPrice: string | null;
  upperBound: string;
  /** The upper bound is PSF standing in for an unset max — the column says so rather than lying. */
  upperBoundIsReferencePrice: boolean;
  barcode: string | null;
  source: string;
  referencePriceSource: string | null;
  cardCount: number;
  marketplaceCodes: string[];
  updatedAt: number;
}

interface FormState {
  id: string | null;
  name: string;
  referencePrice: string;
  minPrice: string;
  maxPrice: string;
  barcode: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  referencePrice: '',
  minPrice: '',
  maxPrice: '',
  barcode: '',
};

const SOURCE_LABEL: Record<string, string> = {
  manual: 'El ile',
  excel: 'Excel',
  migration: 'Taşınan',
};

/** Major units for an input, from kuruş — the inverse of what the server parses back. */
function toInput(kurus: string | null): string {
  if (kurus === null) return '';
  const value = BigInt(kurus);
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  return `${negative ? '-' : ''}${magnitude / 100n},${(magnitude % 100n).toString().padStart(2, '0')}`;
}

export function BrandProductsClient() {
  const [rows, setRows] = useState<BrandProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (query.trim() !== '') params.set('text', query.trim());
    if (unlinkedOnly) params.set('unlinkedOnly', 'true');
    fetch(`/api/brand-products?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { products: BrandProduct[]; total: number }) => {
        setRows(d.products);
        setTotal(d.total);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [page, pageSize, query, unlinkedOnly]);

  useEffect(load, [load]);

  function edit(row: BrandProduct) {
    setForm({
      id: row.id,
      name: row.name,
      referencePrice: toInput(row.referencePrice),
      minPrice: toInput(row.minPrice),
      maxPrice: toInput(row.maxPrice),
      barcode: row.barcode ?? '',
    });
    setFormOpen(true);
    setNotice(null);
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const body = {
        name: form.name,
        referencePrice: form.referencePrice,
        minPrice: form.minPrice,
        maxPrice: form.maxPrice,
        barcode: form.barcode,
      };
      const res = await fetch(form.id ? `/api/brand-products/${form.id}` : '/api/brand-products', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; warnings?: string[] };
      if (!res.ok) {
        setNotice({ ok: false, message: data.error ?? 'Kaydedilemedi.' });
        return;
      }
      // Warnings are the prices the manager may have meant differently — a PSF outside their own
      // band is coherent, so it is saved and said, never refused.
      setNotice({
        ok: true,
        message:
          data.warnings && data.warnings.length > 0
            ? `Kaydedildi. Dikkat: ${data.warnings.join(' ')}`
            : 'Kaydedildi.',
      });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/brand-products/${id}`, { method: 'DELETE' });
    setNotice({ ok: true, message: 'Ürün silindi. Kartları takip listesinde kaldı.' });
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stok"
        description="Kendi ürünleriniz: PSF, min ve max birim başına yazılır; pazaryeri kartları bu ürüne bağlanır."
      />

      {notice && <StatusBanner ok={notice.ok} message={notice.message} />}

      <ImportPanel onImported={load} />

      <Section id="brand-products" title="Ürünler">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Ara (ad veya barkod)">
            <TextInput
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setQuery(text);
                  setPage(0);
                }
              }}
              placeholder="Ürün adı ya da barkod"
              className="w-64"
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unlinkedOnly}
              onChange={(e) => {
                setUnlinkedOnly(e.target.checked);
                setPage(0);
              }}
            />
            Yalnızca kartı olmayanlar
          </label>
          <div className="ml-auto">
            <Button
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setFormOpen((open) => !open);
                setNotice(null);
              }}
            >
              {formOpen && form.id === null ? 'Vazgeç' : 'Yeni Ürün'}
            </Button>
          </div>
        </div>

        {formOpen && (
          <div className="mb-4 rounded border border-(--color-border) p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Ürün adı">
                <TextInput
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-72"
                />
              </Field>
              <Field label="PSF (birim)">
                <TextInput
                  value={form.referencePrice}
                  onChange={(e) => setForm({ ...form, referencePrice: e.target.value })}
                  placeholder="1.249,90"
                  className="w-32"
                />
              </Field>
              <Field label="Min (birim)">
                <TextInput
                  value={form.minPrice}
                  onChange={(e) => setForm({ ...form, minPrice: e.target.value })}
                  placeholder="boş = alarm yok"
                  className="w-32"
                />
              </Field>
              <Field label="Max (birim)">
                <TextInput
                  value={form.maxPrice}
                  onChange={(e) => setForm({ ...form, maxPrice: e.target.value })}
                  placeholder="boş = PSF"
                  className="w-32"
                />
              </Field>
              <Field label="Barkod">
                <TextInput
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="öneri için"
                  className="w-40"
                />
              </Field>
              <Button type="button" disabled={busy} onClick={() => void save()}>
                {busy ? 'Kaydediliyor…' : form.id ? 'Güncelle' : 'Ekle'}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setFormOpen(false);
                }}
              >
                Kapat
              </Button>
            </div>
            <p className="mt-2 text-xs text-(--color-muted)">
              Fiyatlar <strong>birim başına</strong>dır. Üç&apos;lü paket satan bir kart, çarpanıyla
              ölçeklenerek karşılaştırılır. Max boşsa üst sınır PSF olur.
            </p>
          </div>
        )}

        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : loading ? (
          <LoadingState message="Ürünler yükleniyor…" skeletonRows={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            message={query.trim() === '' && !unlinkedOnly ? 'Henüz ürün yok.' : 'Bu filtreye uyan ürün yok.'}
            reason={
              query.trim() === '' && !unlinkedOnly
                ? 'Kendi ürünlerinizi ekleyin, sonra her ürüne pazaryeri kartlarını bağlayın.'
                : 'Aramayı ya da filtreyi değiştirin.'
            }
          />
        ) : (
          <>
            <TableFrame>
              <table className="w-full text-sm">
                <thead className={STICKY_HEAD}>
                  <tr className="text-left">
                    <th className="p-2">Ürün</th>
                    <th className="p-2">PSF</th>
                    <th className="p-2">Min</th>
                    <th className="p-2">Üst sınır</th>
                    <th className="p-2">Barkod</th>
                    <th className="p-2">Kart</th>
                    <th className="p-2">Kaynak</th>
                    <th className="p-2">Güncellendi</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-(--color-border)">
                      <td className="p-2">
                        <Link className="underline" href={`/brand/products/${row.id}`}>
                          {row.name}
                        </Link>
                      </td>
                      <td className="p-2 tabular-nums">{formatMoney(BigInt(row.referencePrice))}</td>
                      <td className="p-2 tabular-nums">
                        {row.minPrice === null ? (
                          <span className="text-(--color-muted)" title="Alt sınır alarmı yok">
                            —
                          </span>
                        ) : (
                          formatMoney(BigInt(row.minPrice))
                        )}
                      </td>
                      <td className="p-2 tabular-nums">
                        {formatMoney(BigInt(row.upperBound))}
                        {row.upperBoundIsReferencePrice && (
                          <span className="ml-1 text-xs text-(--color-muted)" title="Max girilmemiş">
                            PSF
                          </span>
                        )}
                      </td>
                      <td className="p-2">{row.barcode ?? '—'}</td>
                      <td className="p-2">
                        {row.cardCount === 0 ? (
                          <span className="text-(--color-warning)" title="Bu ürün hiçbir karta bağlı değil">
                            yok
                          </span>
                        ) : (
                          <>
                            {formatNumber(row.cardCount)}
                            <span className="ml-1 text-xs text-(--color-muted)">
                              {row.marketplaceCodes.join(', ')}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="p-2 text-xs">{SOURCE_LABEL[row.source] ?? row.source}</td>
                      <td className="p-2 text-xs">{formatDateTime(row.updatedAt)}</td>
                      <td className="p-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            type="button"
                            className="px-2! py-1! text-xs"
                            onClick={() => edit(row)}
                          >
                            Düzenle
                          </Button>
                          <ConfirmButton
                            requireConfirm
                            confirmMessage={`"${row.name}" silinsin mi? Kartları takip listesinde kalır.`}
                            className="rounded border border-(--color-border) px-2 py-1 text-xs"
                            onConfirmed={() => void remove(row.id)}
                          >
                            Sil
                          </ConfirmButton>
                        </div>
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
              label="ürün"
            />
          </>
        )}
      </Section>
    </div>
  );
}
