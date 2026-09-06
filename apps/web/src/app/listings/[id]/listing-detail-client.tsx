'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PriceChart } from '@/components/price-chart';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import { Ago, Chip, ConfirmButton, ErrorState, LoadingState } from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import {
  DECISION_REASON_LABELS as REASON_LABELS,
  PHASE_LABELS,
  SUBMISSION_STATE_LABELS as STATE_LABELS,
} from '@/lib/labels';

interface Detail {
  listing: {
    id: string;
    marketplaceCode: string;
    marketplaceListingId: string;
    sellerStockCode: string;
    baseStockCode: string | null;
    productName: string;
    price: string;
    offeredStock: number;
    isSalable: boolean;
    isLocked: boolean;
    isSuspended: boolean;
    isBlacklisted: boolean;
    lockReasons: string | null;
    deactivationReasons: string | null;
    minPrice: string | null;
    maxPrice: string | null;
    repriceEnabled: boolean;
    lastSeenAt: number;
  };
  waterfall: {
    unitCost: string;
    cargo: string;
    commission: string;
    vatRate: number;
    floorPrice: string;
  } | null;
  competition: {
    buybox: {
      observedAt: number;
      rank: number | null;
      buyboxPrice: string | null;
      secondPrice: string | null;
      thirdPrice: string | null;
      hasMultipleSeller: boolean;
    } | null;
    offers: {
      sellerName: string;
      sellerRef: string | null;
      rank: number;
      price: string | null;
      finalPrice: string | null;
      rating: number | null;
      dispatchTime: number | null;
      offeredStock: number | null;
      hasPromotion: boolean;
    }[];
    priceHistory: {
      observedAt: number;
      buyboxPrice: string | null;
      secondPrice: string | null;
      rank: number | null;
      buyboxSellerName: string | null;
      buyboxSellerRef: string | null;
    }[];
  };
  engine: {
    phase: string;
    lastGoodPrice: string | null;
    lastBadPrice: string | null;
    optimumPrice: string | null;
    settleUntil: number | null;
    consecutiveRejections: number;
    updatedAt: number;
  } | null;
  lastDecisionExplanation: { reason: string; explanation: string; decidedAt: number } | null;
  history: {
    id: string;
    decidedAt: number;
    oldPrice: string;
    newPrice: string;
    reason: string;
    explanation: string;
    state: string;
    failureCode: string | null;
    failureMessage: string | null;
    floorPrice: string | null;
    buyboxPrice: string | null;
    rank: number | null;
  }[];
}

/**
 * Buybox, the runner-up and our own price over the retained observation window. Our price is a
 * level rather than a series — `listings.price` keeps only the current value, so drawing it as a
 * line over time would invent history it does not have; `Fiyat Geçmişi` below is where past
 * submissions are stated as fact.
 */
function PriceHistoryChart({
  history,
  ourPrice,
}: {
  history: Detail['competition']['priceHistory'];
  ourPrice: string;
}) {
  const money = (v: string | null) => (v === null ? null : BigInt(v));
  return (
    <PriceChart
      timestamps={history.map((h) => h.observedAt)}
      series={[
        {
          key: 'buybox',
          label: 'Buybox',
          color: 'var(--color-warning)',
          values: history.map((h) => money(h.buyboxPrice)),
        },
        {
          key: 'second',
          label: '2. Fiyat',
          color: 'var(--color-muted)',
          values: history.map((h) => money(h.secondPrice)),
        },
        {
          key: 'ours',
          label: 'Bizim Fiyatımız',
          color: 'var(--color-accent)',
          dashed: true,
          values: history.map(() => BigInt(ourPrice)),
        },
      ]}
      annotations={[
        { label: 'Buybox satıcı', values: history.map((h) => h.buyboxSellerName) },
        { label: 'Sıramız', values: history.map((h) => (h.rank === null ? null : String(h.rank))) },
      ]}
    />
  );
}

/** Stable identity for "the detail has not arrived yet". */
const NO_ROWS: never[] = [];

export function ListingDetailClient({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [priceInput, setPriceInput] = useState('');
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const pagedOffers = usePagedRows(detail?.competition.offers ?? NO_ROWS, { pageSize: 25 });
  const pagedHistory = usePagedRows(detail?.history ?? NO_ROWS, { pageSize: 25 });

  // `useCallback` so the retry button in `ErrorState` and the effect below share one function
  // identity, the same shape `seller-detail-client.tsx` uses.
  const load = useCallback(() => {
    setError(undefined);
    fetch(`/api/listings/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = (await r.json()) as { error?: string };
          setError(d.error ?? 'İlan yüklenemedi.');
          return;
        }
        const d = (await r.json()) as Detail;
        setDetail(d);
        setMinInput(d.listing.minPrice ? (Number(d.listing.minPrice) / 100).toFixed(2) : '');
        setMaxInput(d.listing.maxPrice ? (Number(d.listing.maxPrice) / 100).toFixed(2) : '');
      })
      .catch(() => setError('İlan yüklenemedi.'));
  }, [id]);

  useEffect(load, [load]);

  async function submitManualPrice() {
    if (!priceInput) return;
    setBusy(true);
    setBusyLabel('Gönderiliyor…');
    try {
      const res = await fetch(`/api/listings/${id}/manual-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPrice: priceInput }),
      });
      if (res.ok) {
        setPriceInput('');
        load();
      } else {
        const d = (await res.json()) as { error?: string };
        setError(d.error ?? 'Gönderilemedi.');
      }
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function bulkOne(
    action: 'forceReoptimize' | 'disableAutomation' | 'enableAutomation',
    label: string,
  ) {
    setBusy(true);
    setBusyLabel(label);
    try {
      await fetch('/api/listings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [id] }),
      });
      load();
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  async function saveBounds() {
    setBusy(true);
    setBusyLabel('Kaydediliyor…');
    try {
      await fetch('/api/listings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setMinMax',
          ids: [id],
          minPrice: minInput || null,
          maxPrice: maxInput || null,
        }),
      });
      load();
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }

  // Loading and error never share a line (doc 15 §3.2): the operator needs "nothing has
  // arrived yet" to read differently from "the request failed", and only the latter earns a
  // "Tekrar dene" button.
  if (error && !detail) {
    return (
      <div className="p-6">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="p-6">
        <LoadingState message="İlan yükleniyor…" skeletonRows={4} />
      </div>
    );
  }

  const { listing, waterfall, competition, engine, lastDecisionExplanation, history } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/listings" className="text-xs text-(--color-accent) hover:underline">
          ← İlanlara dön
        </Link>
        <h1 className="text-2xl font-semibold">{listing.productName}</h1>
        <p className="text-sm text-(--color-muted)">
          {listing.marketplaceCode} · {listing.marketplaceListingId} · {listing.sellerStockCode}
        </p>
      </div>

      {/* A background reload (after a manual price, an automation toggle, a bounds save) can
          fail without wiping the detail already on screen — that failure is reported here,
          separately from the primary-load error state above (doc 15 §3.2 "Stale"). */}
      {error && detail && (
        <p className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-2 text-sm text-(--color-danger)">
          {error}
        </p>
      )}

      {/* Now — the panel R-UI-8 lives on: the price must be explainable here, without opening
          the history table below. */}
      <section className="rounded border border-(--color-border) p-4" aria-labelledby="now-heading">
        <h2 id="now-heading" className="mb-3 text-lg font-medium">
          Şu An
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-(--color-muted)">Satış Fiyatı</div>
            <div className="text-lg">{formatMoney(BigInt(listing.price))}</div>
          </div>
          <div>
            <div className="text-xs text-(--color-muted)">Dip Fiyat</div>
            <div className="text-lg">{waterfall ? formatMoney(BigInt(waterfall.floorPrice)) : '—'}</div>
          </div>
          <div>
            <div className="text-xs text-(--color-muted)">Stok</div>
            <div className="text-lg">{formatNumber(listing.offeredStock)}</div>
          </div>
          <div>
            <div className="text-xs text-(--color-muted)">Durum</div>
            <div className="flex flex-wrap gap-1">
              {!listing.isSalable && <Chip tone="danger">Satılamaz</Chip>}
              {listing.isBlacklisted && <Chip tone="danger">Kara Liste</Chip>}
              {listing.isLocked && <Chip tone="warn">Kilitli</Chip>}
              {listing.isSuspended && <Chip tone="warn">Askıda</Chip>}
              {listing.isSalable && !listing.isLocked && !listing.isSuspended && !listing.isBlacklisted && (
                <Chip tone="ok">Sorun yok</Chip>
              )}
            </div>
          </div>
        </div>

        {waterfall && (
          <div className="mt-4">
            <div className="text-xs text-(--color-muted)">
              Fiyat Şelalesi (Birim Maliyet → Kargo/Gider → Komisyon → KDV → Dip Fiyat)
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-(--color-chip-bg) px-2 py-1">
                Maliyet {formatMoney(BigInt(waterfall.unitCost))}
              </span>
              <span>→</span>
              <span className="rounded bg-(--color-chip-bg) px-2 py-1">
                +Kargo/Gider {formatMoney(BigInt(waterfall.cargo))}
              </span>
              <span>→</span>
              <span className="rounded bg-(--color-chip-bg) px-2 py-1">
                +Komisyon {formatMoney(BigInt(waterfall.commission))}
              </span>
              <span>→</span>
              <span className="rounded bg-(--color-chip-bg) px-2 py-1">KDV %{waterfall.vatRate}</span>
              <span>=</span>
              <span className="rounded bg-(--color-accent) px-2 py-1 text-(--color-accent-ink)">
                Dip Fiyat {formatMoney(BigInt(waterfall.floorPrice))}
              </span>
            </div>
            {/* The gap between the selling price and the floor it was decomposed from — the
                number the "Motor" panel's reason (below) explains, without the operator having
                to subtract the two figures above themselves. */}
            <p className="mt-2 text-xs text-(--color-muted)">
              Satış fiyatı dip fiyatın{' '}
              <span className="font-medium text-(--color-text)">
                {formatMoney(BigInt(listing.price) - BigInt(waterfall.floorPrice))}
              </span>{' '}
              üzerinde.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs">
            Elle Fiyat Gönder
            <input
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="Yeni fiyat"
              className="w-28 rounded border border-(--color-border) px-2 py-1 text-sm"
            />
          </label>
          <ConfirmButton
            requireConfirm
            confirmMessage={`Fiyat ${priceInput} olarak gönderilsin mi? Bu, otomasyonu geçici olarak duraklatır.`}
            onConfirmed={() => void submitManualPrice()}
            disabled={busy || !priceInput}
            className="rounded bg-(--color-accent) px-3 py-1 text-sm text-(--color-accent-ink) disabled:opacity-50"
          >
            Gönder
          </ConfirmButton>
          {busy && busyLabel === 'Gönderiliyor…' && (
            <span aria-live="polite" className="text-sm text-(--color-muted)">
              {busyLabel}
            </span>
          )}
        </div>
      </section>

      {/* Competition */}
      <section className="rounded border border-(--color-border) p-4" aria-labelledby="competition-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="competition-heading" className="text-lg font-medium">
            Rekabet
          </h2>
          <button
            type="button"
            disabled={competition.offers.length === 0}
            onClick={() =>
              downloadCsv(
                `ilan-rekabet-${listing.marketplaceListingId}.csv`,
                competition.offers.map((o) => ({
                  Sıra: o.rank,
                  Satıcı: o.sellerName,
                  Fiyat: o.price ? (Number(o.price) / 100).toFixed(2) : '',
                  'Müşteri Fiyatı': o.finalPrice ? (Number(o.finalPrice) / 100).toFixed(2) : '',
                  Puan: o.rating ?? '',
                  'Kargo Süresi': o.dispatchTime ?? '',
                  Stok: o.offeredStock ?? '',
                })),
              )
            }
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
          >
            Excel&apos;e Aktar
          </button>
        </div>
        {competition.buybox && (
          <p className="mb-2 text-sm">
            Sıra <b>{competition.buybox.rank ?? '—'}</b> · Buybox{' '}
            {formatMoney(competition.buybox.buyboxPrice ? BigInt(competition.buybox.buyboxPrice) : null)} ·{' '}
            <Ago at={competition.buybox.observedAt} />
          </p>
        )}
        <PriceHistoryChart history={competition.priceHistory} ourPrice={listing.price} />
        <TableFrame className="mt-3" maxHeight="50vh">
          <table className="w-full text-xs">
            <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
              <tr>
                <th className="px-2 py-1">Sıra</th>
                <th className="px-2 py-1">Satıcı</th>
                <th className="px-2 py-1">Fiyat</th>
                <th className="px-2 py-1">Müşteri Fiyatı</th>
                <th className="px-2 py-1">Puan</th>
                <th className="px-2 py-1">Kargo Süresi</th>
                <th className="px-2 py-1">Stok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {pagedOffers.rows.map((o, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">{o.rank}</td>
                  <td className="px-2 py-1">{o.sellerName}</td>
                  <td className="px-2 py-1">{formatMoney(o.price ? BigInt(o.price) : null)}</td>
                  <td className="px-2 py-1">{formatMoney(o.finalPrice ? BigInt(o.finalPrice) : null)}</td>
                  <td className="px-2 py-1">{o.rating ?? '—'}</td>
                  <td className="px-2 py-1">{o.dispatchTime ?? '—'}</td>
                  <td className="px-2 py-1">{o.offeredStock ?? '—'}</td>
                </tr>
              ))}
              {competition.offers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-(--color-muted)">
                    Kayıtlı rakip teklifi yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableFrame>
        <div className="mt-2">
          <Pagination state={pagedOffers} label="teklif" />
        </div>
      </section>

      {/* Engine — "why the last decision was what it was, in words" (doc 06 §5). */}
      <section className="rounded border border-(--color-border) p-4" aria-labelledby="engine-heading">
        <h2 id="engine-heading" className="mb-3 text-lg font-medium">
          Motor
        </h2>
        {engine ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-(--color-muted)">Faz</div>
              <div className="text-lg">{PHASE_LABELS[engine.phase] ?? engine.phase}</div>
            </div>
            <div>
              <div className="text-xs text-(--color-muted)">Son İyi Fiyat</div>
              <div className="text-lg">
                {formatMoney(engine.lastGoodPrice ? BigInt(engine.lastGoodPrice) : null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-(--color-muted)">Son Kötü Fiyat</div>
              <div className="text-lg">
                {formatMoney(engine.lastBadPrice ? BigInt(engine.lastBadPrice) : null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-(--color-muted)">Optimum Fiyat</div>
              <div className="text-lg">
                {formatMoney(engine.optimumPrice ? BigInt(engine.optimumPrice) : null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-(--color-muted)">Duraklatma Bitişi</div>
              <div className="text-sm">
                <Ago at={engine.settleUntil} never="—" />
              </div>
            </div>
            <div>
              <div className="text-xs text-(--color-muted)">Ardışık Ret</div>
              <div className="text-sm">{formatNumber(engine.consecutiveRejections)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-(--color-muted)">Bu ilan için motor henüz bir karar üretmedi.</p>
        )}

        {lastDecisionExplanation && (
          <div className="mt-3 rounded bg-(--color-hover) p-3 text-sm">
            <span className="font-medium">
              {REASON_LABELS[lastDecisionExplanation.reason] ?? lastDecisionExplanation.reason}:
            </span>{' '}
            {lastDecisionExplanation.explanation}
            <span className="ml-2 text-xs text-(--color-muted)">
              <Ago at={lastDecisionExplanation.decidedAt} />
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Force re-optimize is a one-off action with a real consequence (resets the phase
                to SEEKING), not a toggle direction — it always confirms (doc 15 §3.6). */}
            <ConfirmButton
              requireConfirm
              confirmMessage="Yeniden optimize edilsin mi? Bu, fiyatlamayı baştan aramaya döndürür."
              onConfirmed={() => void bulkOne('forceReoptimize', 'Yeniden optimize ediliyor…')}
              disabled={busy}
              className="rounded border px-3 py-1 text-sm"
            >
              Yeniden Optimize Et
            </ConfirmButton>
            {/* §3.6 confirmation asymmetry: turning automation back ON creates risk (the bot
                resumes changing this listing's price) and confirms; turning it OFF removes risk
                and is one click — mirroring the dashboard's price-submission switch. */}
            <ConfirmButton
              requireConfirm={!listing.repriceEnabled}
              confirmMessage="Otomasyon devam ettirilsin mi? Fiyat, motor tarafından tekrar otomatik değiştirilir."
              onConfirmed={() =>
                void bulkOne(
                  listing.repriceEnabled ? 'disableAutomation' : 'enableAutomation',
                  listing.repriceEnabled ? 'Duraklatılıyor…' : 'Sürdürülüyor…',
                )
              }
              disabled={busy}
              className="rounded border px-3 py-1 text-sm"
            >
              {listing.repriceEnabled ? 'Otomasyonu Duraklat' : 'Otomasyonu Sürdür'}
            </ConfirmButton>
            {busy &&
              (busyLabel === 'Yeniden optimize ediliyor…' ||
                busyLabel === 'Duraklatılıyor…' ||
                busyLabel === 'Sürdürülüyor…') && (
                <span aria-live="polite" className="text-sm text-(--color-muted)">
                  {busyLabel}
                </span>
              )}
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col text-xs">
              Min Fiyat
              <input
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                className="w-24 rounded border border-(--color-border) px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs">
              Max Fiyat
              <input
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                className="w-24 rounded border border-(--color-border) px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveBounds()}
              className="rounded border px-3 py-1 text-sm"
            >
              Sınırları Kaydet
            </button>
            {busy && busyLabel === 'Kaydediliyor…' && (
              <span aria-live="polite" className="text-sm text-(--color-muted)">
                {busyLabel}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* History — an audit log, so `decidedAt` stays an absolute timestamp on purpose (doc 15
          §3.3: "Absolute time is correct only where the exact instant is the point — an audit
          record"). This is what makes a price explainable months later (doc 06 §5). */}
      <section className="rounded border border-(--color-border) p-4" aria-labelledby="history-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="history-heading" className="text-lg font-medium">
            Fiyat Geçmişi
          </h2>
          <button
            type="button"
            disabled={history.length === 0}
            onClick={() =>
              downloadCsv(
                `ilan-fiyat-gecmisi-${listing.marketplaceListingId}.csv`,
                history.map((h) => ({
                  'Karar Zamanı': formatDateTime(h.decidedAt),
                  'Eski Fiyat': (Number(h.oldPrice) / 100).toFixed(2),
                  'Yeni Fiyat': (Number(h.newPrice) / 100).toFixed(2),
                  Sebep: REASON_LABELS[h.reason] ?? h.reason,
                  Durum: STATE_LABELS[h.state] ?? h.state,
                  'Dip Fiyat': h.floorPrice ? (Number(h.floorPrice) / 100).toFixed(2) : '',
                  Buybox: h.buyboxPrice ? (Number(h.buyboxPrice) / 100).toFixed(2) : '',
                  Sıra: h.rank ?? '',
                  Hata: h.failureCode ? `${h.failureCode}: ${h.failureMessage ?? ''}` : '',
                })),
              )
            }
            className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
          >
            Excel&apos;e Aktar
          </button>
        </div>
        <TableFrame maxHeight="50vh">
          <table className="w-full text-xs">
            <thead className={`${STICKY_HEAD} text-left uppercase text-(--color-muted)`}>
              <tr>
                <th className="px-2 py-1">Karar Zamanı</th>
                <th className="px-2 py-1">Eski → Yeni</th>
                <th className="px-2 py-1">Sebep</th>
                <th className="px-2 py-1">Durum</th>
                <th className="px-2 py-1">Dip Fiyat</th>
                <th className="px-2 py-1">Buybox</th>
                <th className="px-2 py-1">Sıra</th>
                <th className="px-2 py-1">Hata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {pagedHistory.rows.map((h) => (
                <tr key={h.id}>
                  <td className="px-2 py-1">{formatDateTime(h.decidedAt)}</td>
                  <td className="px-2 py-1">
                    {formatMoney(BigInt(h.oldPrice))} → {formatMoney(BigInt(h.newPrice))}
                  </td>
                  <td className="px-2 py-1" title={h.explanation}>
                    {REASON_LABELS[h.reason] ?? h.reason}
                  </td>
                  <td className="px-2 py-1">{STATE_LABELS[h.state] ?? h.state}</td>
                  <td className="px-2 py-1">{formatMoney(h.floorPrice ? BigInt(h.floorPrice) : null)}</td>
                  <td className="px-2 py-1">{formatMoney(h.buyboxPrice ? BigInt(h.buyboxPrice) : null)}</td>
                  <td className="px-2 py-1">{h.rank ?? '—'}</td>
                  <td className="px-2 py-1 text-(--color-danger)">
                    {h.failureCode ? `${h.failureCode}: ${h.failureMessage ?? ''}` : ''}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-(--color-muted)">
                    Bu ilan için henüz fiyat gönderimi yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableFrame>
        <div className="mt-2">
          <Pagination state={pagedHistory} label="karar" />
        </div>
      </section>
    </div>
  );
}
