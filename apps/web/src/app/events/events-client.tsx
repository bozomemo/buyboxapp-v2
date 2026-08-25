'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime } from '@/lib/format';

interface EventRow {
  id: string;
  at: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  marketplaceCode: string | null;
  listingId: string | null;
  jobRunId: string | null;
  code: string;
  message: string;
  context: string | null;
}

interface ListingOption {
  id: string;
  productName: string;
  baseStockCode: string | null;
}

const LEVEL_LABELS: Record<string, string> = { debug: 'debug', info: 'bilgi', warn: 'uyarı', error: 'hata' };

const LEVEL_CLASS: Record<string, string> = {
  debug: 'text-(--color-muted)',
  info: 'text-(--color-muted)',
  warn: 'text-(--color-warning)',
  error: 'text-(--color-danger)',
};

export function EventsClient() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [minLevel, setMinLevel] = useState('');
  const [marketplaceCode, setMarketplaceCode] = useState('');
  const [code, setCode] = useState('');
  const [sinceMs, setSinceMs] = useState('');
  const [untilMs, setUntilMs] = useState('');
  const [listingQuery, setListingQuery] = useState('');
  const [listingOptions, setListingOptions] = useState<ListingOption[]>([]);
  const [selectedListing, setSelectedListing] = useState<ListingOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverLimit, setServerLimit] = useState<number | null>(null);
  const paged = usePagedRows(events, {
    resetKey: [minLevel, marketplaceCode, code, sinceMs, untilMs, selectedListing?.id].join('|'),
  });

  const load = () => {
    const params = new URLSearchParams();
    if (minLevel) params.set('minLevel', minLevel);
    if (marketplaceCode) params.set('marketplaceCode', marketplaceCode);
    if (code) params.set('code', code);
    if (sinceMs) params.set('sinceMs', String(new Date(sinceMs).getTime()));
    if (untilMs) params.set('untilMs', String(new Date(untilMs).getTime()));
    if (selectedListing) params.set('listingId', selectedListing.id);
    fetch(`/api/events?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { events: EventRow[]; limit: number }) => {
        setEvents(data.events);
        setServerLimit(data.limit);
      })
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    load();
  }, [minLevel, marketplaceCode, code, sinceMs, untilMs, selectedListing]);

  useEffect(() => {
    if (!listingQuery) {
      setListingOptions([]);
      return;
    }
    const handle = setTimeout(() => {
      fetch(`/api/competitors/listings?text=${encodeURIComponent(listingQuery)}`)
        .then((r) => r.json())
        .then((data: { rows: ListingOption[] }) => setListingOptions(data.rows))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(handle);
  }, [listingQuery]);

  return (
    <div className="space-y-4">
      {error && <p className="text-(--color-danger)">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={events.length === 0}
          onClick={() =>
            downloadCsv(
              'olay-gunlugu.csv',
              events.map((e) => ({
                Zaman: formatDateTime(e.at),
                Seviye: LEVEL_LABELS[e.level] ?? e.level,
                Pazaryeri: e.marketplaceCode ?? '',
                Kod: e.code,
                Mesaj: e.message,
              })),
            )
          }
          className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover) disabled:opacity-40"
        >
          Excel&apos;e Aktar
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-(--color-muted)">
          En düşük seviye
          <select
            className="mt-1 block rounded border border-(--color-border) px-2 py-1 text-sm"
            value={minLevel}
            onChange={(e) => setMinLevel(e.target.value)}
          >
            <option value="">Tümü</option>
            <option value="debug">debug ve üzeri</option>
            <option value="info">bilgi ve üzeri</option>
            <option value="warn">uyarı ve üzeri</option>
            <option value="error">yalnızca hata</option>
          </select>
        </label>
        <label className="text-xs text-(--color-muted)">
          Pazaryeri
          <select
            className="mt-1 block rounded border border-(--color-border) px-2 py-1 text-sm"
            value={marketplaceCode}
            onChange={(e) => setMarketplaceCode(e.target.value)}
          >
            <option value="">Tümü</option>
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
          </select>
        </label>
        <label className="text-xs text-(--color-muted)">
          Kod
          <input
            className="mt-1 block rounded border border-(--color-border) px-2 py-1 text-sm"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ör. SubmitPriceChangesBatchFailed"
          />
        </label>
        <label className="relative text-xs text-(--color-muted)">
          İlan
          <input
            className="mt-1 block rounded border border-(--color-border) px-2 py-1 text-sm"
            value={selectedListing ? selectedListing.productName : listingQuery}
            onChange={(e) => {
              setSelectedListing(null);
              setListingQuery(e.target.value);
            }}
            placeholder="ürün adı ara…"
          />
          {listingOptions.length > 0 && !selectedListing && (
            <ul className="absolute z-10 mt-1 max-h-48 w-64 overflow-auto rounded border border-(--color-border) bg-(--color-surface) shadow">
              {listingOptions.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="block w-full px-2 py-1 text-left text-sm hover:bg-(--color-hover)"
                    onClick={() => {
                      setSelectedListing(o);
                      setListingOptions([]);
                    }}
                  >
                    {o.productName} {o.baseStockCode ? `(${o.baseStockCode})` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
        <label className="text-xs text-(--color-muted)">
          Başlangıç
          <input
            type="datetime-local"
            className="mt-1 block rounded border border-(--color-border) px-2 py-1 text-sm"
            value={sinceMs}
            onChange={(e) => setSinceMs(e.target.value)}
          />
        </label>
        <label className="text-xs text-(--color-muted)">
          Bitiş
          <input
            type="datetime-local"
            className="mt-1 block rounded border border-(--color-border) px-2 py-1 text-sm"
            value={untilMs}
            onChange={(e) => setUntilMs(e.target.value)}
          />
        </label>
      </div>

      <TableFrame>
        <table className="w-full text-sm">
          <thead className={`${STICKY_HEAD} text-left text-xs uppercase text-(--color-muted)`}>
            <tr>
              <th className="px-3 py-2">Zaman</th>
              <th className="px-3 py-2">Seviye</th>
              <th className="px-3 py-2">Pazaryeri</th>
              <th className="px-3 py-2">Kod</th>
              <th className="px-3 py-2">Mesaj</th>
              <th className="px-3 py-2">Bağlantılar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {paged.rows.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-3 py-2 text-(--color-muted)">
                  {formatDateTime(e.at)}
                </td>
                <td className={`px-3 py-2 font-medium ${LEVEL_CLASS[e.level]}`}>{LEVEL_LABELS[e.level]}</td>
                <td className="px-3 py-2 text-(--color-muted)">{e.marketplaceCode ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.code}</td>
                <td className="px-3 py-2">{e.message}</td>
                <td className="px-3 py-2 text-xs">
                  {e.listingId && (
                    <Link href={`/listings/${e.listingId}`} className="text-(--color-accent) underline">
                      İlan
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-(--color-muted)">
                  Kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>

      <Pagination state={paged} label="kayıt">
        {/* The server sends the newest N; without this the pager would present a truncated
            result as the whole of it. */}
        {serverLimit !== null && events.length >= serverLimit && (
          <> — en yeni {serverLimit} kayıt gösteriliyor, daha eskisi için aralığı daraltın</>
        )}
      </Pagination>
    </div>
  );
}
