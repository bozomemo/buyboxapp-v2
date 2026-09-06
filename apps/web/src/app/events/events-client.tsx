'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Pagination, STICKY_HEAD, TableFrame, usePagedRows } from '@/components/table';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
  TONE_TEXT,
  type Tone,
} from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime } from '@/lib/format';
import { LEVEL_LABELS } from '@/lib/labels';

/**
 * `/events` — the raw technical log behind the job queue and the marketplace integrations (doc 06
 * §8). This is a **diagnostic screen, not the operator's main working screen**: nobody comes here
 * to decide anything, they come here to answer "what exactly happened, and when" after a triage
 * question was raised somewhere else (`/jobs`, an alert, a listing's price history). Doc 15 §4.6
 * (Tier C — consistency pass, not a redesign): the hierarchy here is already right for a log
 * viewer, so this pass applies §3's shared contract without changing what the screen is for.
 */

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

/** Tone per log level. `debug`/`info` carry no verdict (neutral); `warn`/`error` do. */
const LEVEL_TONE: Record<EventRow['level'], Tone> = {
  debug: 'neutral',
  info: 'neutral',
  warn: 'warn',
  error: 'danger',
};

export function EventsClient() {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [minLevel, setMinLevel] = useState('');
  const [marketplaceCode, setMarketplaceCode] = useState('');
  const [code, setCode] = useState('');
  const [sinceMs, setSinceMs] = useState('');
  const [untilMs, setUntilMs] = useState('');
  const [listingQuery, setListingQuery] = useState('');
  const [listingOptions, setListingOptions] = useState<ListingOption[]>([]);
  const [selectedListing, setSelectedListing] = useState<ListingOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverLimit, setServerLimit] = useState<number | null>(null);
  const paged = usePagedRows(events ?? EMPTY_EVENTS, {
    resetKey: [minLevel, marketplaceCode, code, sinceMs, untilMs, selectedListing?.id].join('|'),
  });

  const filtersActive = Boolean(minLevel || marketplaceCode || code || sinceMs || untilMs || selectedListing);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (minLevel) params.set('minLevel', minLevel);
    if (marketplaceCode) params.set('marketplaceCode', marketplaceCode);
    if (code) params.set('code', code);
    if (sinceMs) params.set('sinceMs', String(new Date(sinceMs).getTime()));
    if (untilMs) params.set('untilMs', String(new Date(untilMs).getTime()));
    if (selectedListing) params.set('listingId', selectedListing.id);
    fetch(`/api/events?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Olay günlüğü yüklenemedi.'))))
      .then((data: { events: EventRow[]; limit: number }) => {
        setEvents(data.events);
        setServerLimit(data.limit);
      })
      .catch((e: Error) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [minLevel, marketplaceCode, code, sinceMs, untilMs, selectedListing]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!listingQuery) {
      setListingOptions([]);
      return;
    }
    const handle = setTimeout(() => {
      // The autocomplete's own fetch, not the screen's primary load — a failure here just means
      // no suggestions show, so it is left un-alarmed rather than routed through the retry banner
      // that a failed primary load gets (doc 15 §3.2 governs the primary load, not every request).
      fetch(`/api/competitors/listings?text=${encodeURIComponent(listingQuery)}`)
        .then((r) => r.json())
        .then((data: { rows: ListingOption[] }) => setListingOptions(data.rows))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(handle);
  }, [listingQuery]);

  // Six-states contract (doc 15 §3.2): loading and error never share a line, and a failed primary
  // load is retryable rather than a dead end.
  if (error && events === null) {
    return <ErrorState message={error} onRetry={load} />;
  }
  if (events === null) {
    return <LoadingState message="Olay günlüğü yükleniyor…" skeletonRows={4} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Olaylar"
        description="Arka plan işlerinin ve pazaryeri entegrasyonlarının teknik günlüğü. İleri düzey bilgidir —
          bir işin genel durumu için İşler ekranını kullanın; burası bir olayın tam olarak ne zaman ve
          neden yaşandığını aramak içindir."
      />

      {error && (
        <p role="alert" className={`text-sm ${TONE_TEXT.danger}`}>
          Liste yenilenemedi: {error} Aşağıdaki sonuçlar önceki filtreye ait olabilir.
        </p>
      )}

      <Section id="events-filter-heading" title="Filtrele">
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
        {/* A control mid-request says so (doc 15 §3.2 "Busy") — the filters above stay usable and
            the previous rows stay on screen while a filter change reloads. */}
        {loading && (
          <p aria-live="polite" className="mt-2 text-xs text-(--color-muted)">
            Yükleniyor…
          </p>
        )}
      </Section>

      <Section
        id="events-list-heading"
        title={`Olaylar (${events.length})`}
        action={
          events.length > 0 && (
            <button
              type="button"
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
          )
        }
      >
        {events.length === 0 ? (
          <EmptyState
            message={filtersActive ? 'Bu filtreye uyan olay yok.' : 'Henüz olay kaydı yok.'}
            reason={
              filtersActive
                ? 'Filtreleri gevşetin ya da tarih aralığını genişletin.'
                : 'Arka plan işleri ve pazaryeri entegrasyonları çalıştıkça burada birikir.'
            }
          />
        ) : (
          <>
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
                      {/* Absolute, deliberately (doc 15 §3.3's own carve-out): a log line's own
                          timestamp is the point, not how long ago it was. */}
                      <td className="whitespace-nowrap px-3 py-2 text-(--color-muted)">
                        {formatDateTime(e.at)}
                      </td>
                      <td className={`px-3 py-2 font-medium ${TONE_TEXT[LEVEL_TONE[e.level]]}`}>
                        {LEVEL_LABELS[e.level] ?? e.level}
                      </td>
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
          </>
        )}
      </Section>
    </div>
  );
}

/** Stable identity for "nothing has arrived yet", so `usePagedRows` never sees a fresh array. */
const EMPTY_EVENTS: EventRow[] = [];
