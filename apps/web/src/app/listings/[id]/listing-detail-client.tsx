'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';

const PHASE_LABELS: Record<string, string> = {
  SEEKING: 'Arıyor',
  CLIMBING: 'Tırmanıyor',
  REFINING: 'İnceltiyor',
  OPTIMUM: 'Optimum',
  BLOCKED: 'Bloke',
};

const REASON_LABELS: Record<string, string> = {
  manual: 'Elle değiştirildi',
  SellingAtLoss: 'Zararına satış düzeltmesi',
  Refining: 'İnceltme adımı',
};

const STATE_LABELS: Record<string, string> = {
  queued: 'Kuyrukta',
  submitted: 'Gönderildi',
  confirmed: 'Onaylandı',
  failed: 'Başarısız',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
};

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

/** A lightweight inline sparkline — no charting dependency added for this checkpoint (same
 * disclosed simplification approach as the listings grid's server-paging-over-virtualization
 * tradeoff): plots our price and the buybox price over the retained observation window. */
function PriceSparkline({
  history,
  ourPrice,
}: {
  history: Detail['competition']['priceHistory'];
  ourPrice: string;
}) {
  if (history.length < 2)
    return <p className="text-xs text-[var(--color-muted)]">Grafik için yeterli veri yok.</p>;

  const width = 600;
  const height = 120;
  const prices = history
    .map((h) => (h.buyboxPrice ? Number(h.buyboxPrice) : null))
    .filter((v): v is number => v !== null)
    .concat(Number(ourPrice));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = Math.max(1, max - min);
  const x = (i: number) => (i / (history.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * height;

  const buyboxPoints = history
    .map((h, i) => (h.buyboxPrice ? `${x(i)},${y(Number(h.buyboxPrice))}` : null))
    .filter((p): p is string => p !== null)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" preserveAspectRatio="none">
      <polyline points={buyboxPoints} fill="none" stroke="var(--color-warning)" strokeWidth="2" />
      <line
        x1="0"
        y1={y(Number(ourPrice))}
        x2={width}
        y2={y(Number(ourPrice))}
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
    </svg>
  );
}

export function ListingDetailClient({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [priceInput, setPriceInput] = useState('');
  const [minInput, setMinInput] = useState('');
  const [maxInput, setMaxInput] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
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
  }

  useEffect(load, [id]);

  async function submitManualPrice() {
    if (!priceInput) return;
    if (!confirm(`Fiyat ${priceInput} olarak gönderilsin mi? Bu, otomasyonu geçici olarak duraklatır.`))
      return;
    setBusy(true);
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
    }
  }

  async function bulkOne(action: 'forceReoptimize' | 'disableAutomation' | 'enableAutomation') {
    const label =
      action === 'forceReoptimize'
        ? 'Yeniden optimize edilsin mi?'
        : action === 'disableAutomation'
          ? 'Otomasyon duraklatılsın mı?'
          : 'Otomasyon devam ettirilsin mi?';
    if (!confirm(label)) return;
    setBusy(true);
    try {
      await fetch('/api/listings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [id] }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveBounds() {
    setBusy(true);
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
    }
  }

  if (error) return <p className="text-[var(--color-danger)]">{error}</p>;
  if (!detail) return <p className="text-[var(--color-muted)]">Yükleniyor…</p>;

  const { listing, waterfall, competition, engine, lastDecisionExplanation, history } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/listings" className="text-xs text-[var(--color-accent)] hover:underline">
          ← İlanlara dön
        </Link>
        <h1 className="text-2xl font-semibold">{listing.productName}</h1>
        <p className="text-sm text-[var(--color-muted)]">
          {listing.marketplaceCode} · {listing.marketplaceListingId} · {listing.sellerStockCode}
        </p>
      </div>

      {/* Now */}
      <section className="rounded border border-[var(--color-border)] p-4">
        <h2 className="mb-3 text-lg font-medium">Şu An</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-[var(--color-muted)]">Satış Fiyatı</div>
            <div className="text-lg">{formatMoney(BigInt(listing.price))}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">Dip Fiyat</div>
            <div className="text-lg">{waterfall ? formatMoney(BigInt(waterfall.floorPrice)) : '—'}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">Stok</div>
            <div className="text-lg">{formatNumber(listing.offeredStock)}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">Durum</div>
            <div className="flex flex-wrap gap-1 text-xs">
              {!listing.isSalable && <span className="row-danger rounded px-1">Satılamaz</span>}
              {listing.isLocked && <span className="row-muted rounded px-1">Kilitli</span>}
              {listing.isSuspended && <span className="row-muted rounded px-1">Askıda</span>}
              {listing.isBlacklisted && <span className="row-danger rounded px-1">Kara Liste</span>}
              {listing.isSalable &&
                !listing.isLocked &&
                !listing.isSuspended &&
                !listing.isBlacklisted &&
                '—'}
            </div>
          </div>
        </div>

        {waterfall && (
          <div className="mt-4">
            <div className="text-xs text-[var(--color-muted)]">
              Fiyat Şelalesi (Birim Maliyet → Kargo/Gider → Komisyon → KDV → Dip Fiyat)
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded bg-slate-100 px-2 py-1">
                Maliyet {formatMoney(BigInt(waterfall.unitCost))}
              </span>
              <span>→</span>
              <span className="rounded bg-slate-100 px-2 py-1">
                +Kargo/Gider {formatMoney(BigInt(waterfall.cargo))}
              </span>
              <span>→</span>
              <span className="rounded bg-slate-100 px-2 py-1">
                +Komisyon {formatMoney(BigInt(waterfall.commission))}
              </span>
              <span>→</span>
              <span className="rounded bg-slate-100 px-2 py-1">KDV %{waterfall.vatRate}</span>
              <span>=</span>
              <span className="rounded bg-[var(--color-accent)] px-2 py-1 text-white">
                Dip Fiyat {formatMoney(BigInt(waterfall.floorPrice))}
              </span>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs">
            Elle Fiyat Gönder
            <input
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="Yeni fiyat"
              className="w-28 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || !priceInput}
            onClick={() => void submitManualPrice()}
            className="rounded bg-[var(--color-accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Gönder
          </button>
        </div>
      </section>

      {/* Competition */}
      <section className="rounded border border-[var(--color-border)] p-4">
        <h2 className="mb-3 text-lg font-medium">Rekabet</h2>
        {competition.buybox && (
          <p className="mb-2 text-sm">
            Sıra <b>{competition.buybox.rank ?? '—'}</b> · Buybox{' '}
            {formatMoney(competition.buybox.buyboxPrice ? BigInt(competition.buybox.buyboxPrice) : null)} ·{' '}
            {formatDateTime(competition.buybox.observedAt)}
          </p>
        )}
        <PriceSparkline history={competition.priceHistory} ourPrice={listing.price} />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-[var(--color-muted)]">
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
            <tbody className="divide-y divide-[var(--color-border)]">
              {competition.offers.map((o, i) => (
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
                  <td colSpan={7} className="px-2 py-4 text-center text-[var(--color-muted)]">
                    Kayıtlı rakip teklifi yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Engine */}
      <section className="rounded border border-[var(--color-border)] p-4">
        <h2 className="mb-3 text-lg font-medium">Motor</h2>
        {engine ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-[var(--color-muted)]">Faz</div>
              <div className="text-lg">{PHASE_LABELS[engine.phase] ?? engine.phase}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">Son İyi Fiyat</div>
              <div className="text-lg">
                {formatMoney(engine.lastGoodPrice ? BigInt(engine.lastGoodPrice) : null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">Son Kötü Fiyat</div>
              <div className="text-lg">
                {formatMoney(engine.lastBadPrice ? BigInt(engine.lastBadPrice) : null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">Optimum Fiyat</div>
              <div className="text-lg">
                {formatMoney(engine.optimumPrice ? BigInt(engine.optimumPrice) : null)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">Duraklatma Bitişi</div>
              <div className="text-sm">{engine.settleUntil ? formatDateTime(engine.settleUntil) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-muted)]">Ardışık Ret</div>
              <div className="text-sm">{formatNumber(engine.consecutiveRejections)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Bu ilan için motor henüz bir karar üretmedi.</p>
        )}

        {lastDecisionExplanation && (
          <div className="mt-3 rounded bg-slate-50 p-3 text-sm">
            <span className="font-medium">
              {REASON_LABELS[lastDecisionExplanation.reason] ?? lastDecisionExplanation.reason}:
            </span>{' '}
            {lastDecisionExplanation.explanation}
            <span className="ml-2 text-xs text-[var(--color-muted)]">
              {formatDateTime(lastDecisionExplanation.decidedAt)}
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void bulkOne('forceReoptimize')}
              className="rounded border px-3 py-1 text-sm"
            >
              Yeniden Optimize Et
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void bulkOne(listing.repriceEnabled ? 'disableAutomation' : 'enableAutomation')}
              className="rounded border px-3 py-1 text-sm"
            >
              {listing.repriceEnabled ? 'Otomasyonu Duraklat' : 'Otomasyonu Sürdür'}
            </button>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col text-xs">
              Min Fiyat
              <input
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                className="w-24 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col text-xs">
              Max Fiyat
              <input
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                className="w-24 rounded border border-[var(--color-border)] px-2 py-1 text-sm"
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
          </div>
        </div>
      </section>

      {/* History */}
      <section className="rounded border border-[var(--color-border)] p-4">
        <h2 className="mb-3 text-lg font-medium">Fiyat Geçmişi</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left uppercase text-[var(--color-muted)]">
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
            <tbody className="divide-y divide-[var(--color-border)]">
              {history.map((h) => (
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
                  <td className="px-2 py-1 text-[var(--color-danger)]">
                    {h.failureCode ? `${h.failureCode}: ${h.failureMessage ?? ''}` : ''}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-[var(--color-muted)]">
                    Bu ilan için henüz fiyat gönderimi yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
