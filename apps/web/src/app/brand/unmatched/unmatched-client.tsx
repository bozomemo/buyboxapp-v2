'use client';

/**
 * Eşleşmemiş Kartlar (brand roadmap §6.9) — cards one of your own brands' catalogue sweeps found
 * that no brand product claims yet: "whose is this?". They used to sink among thousands of rows
 * on Takip Edilen Ürünler.
 *
 * Most reviewed first, because an unclaimed best seller is a card with no band and so no alarm.
 * A barcode match is offered as a suggestion and still asks for the multiplier; nothing is linked
 * by name. "Bizim değil" takes a card out of the queue for good, and the set-aside list puts it
 * back.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/components/auth-card';
import { DEFAULT_PAGE_SIZE, Pagination, STICKY_HEAD, TableFrame } from '@/components/table';
import { Ago, Button, EmptyState, ErrorState, LoadingState, PageHeader, Section, TextInput } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { labelOf, MARKETPLACE_LABELS } from '@/lib/labels';
import { PermissionFieldset } from '@/lib/permissions';
import { marketplaceProductUrl } from '@/lib/product-url';

interface UnmatchedCard {
  id: string;
  marketplaceCode: string;
  productRef: string;
  productUrl: string;
  label: string;
  brandName: string | null;
  barcode: string | null;
  ratingCount: number | null;
  hasSellers: boolean | null;
  addedAt: number;
  lastScrapedAt: number | null;
  isFavourite: boolean;
  queueDismissedAt: number | null;
  watchedBrandId: string;
  watchedBrandLabel: string;
  suggestions: { id: string; name: string }[];
}

interface Data {
  total: number;
  newCount: number;
  newWindowMs: number;
  cards: UnmatchedCard[];
}

/** The server's Turkish reason, or a fallback naming the HTTP status. */
async function failure(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return errorMessage(data, `${fallback} (HTTP ${response.status}).`);
}

/** Inline "link to the suggested product": the multiplier is the one thing a barcode cannot say. */
function SuggestionLink({ card, onDone }: { card: UnmatchedCard; onDone: (error: string | null) => void }) {
  const suggestion = card.suggestions[0]!;
  const [multiplier, setMultiplier] = useState('1');
  const [busy, setBusy] = useState(false);

  async function link() {
    setBusy(true);
    try {
      const response = await fetch(`/api/brand-products/${suggestion.id}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackedProductId: card.id,
          unitMultiplier: Number(multiplier),
          linkSource: 'barcodeSuggestion',
        }),
      });
      onDone(response.ok ? null : await failure(response, 'Kart bağlanamadı'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-(--color-muted)">Barkodu eşleşiyor:</span>
      <Link className="underline" href={`/brand/products/${suggestion.id}`}>
        {suggestion.name}
      </Link>
      {card.suggestions.length > 1 && (
        <span className="text-xs text-(--color-muted)">+{card.suggestions.length - 1} ürün daha</span>
      )}
      <span className="text-xs text-(--color-muted)">×</span>
      <TextInput
        aria-label="Adet çarpanı"
        inputMode="numeric"
        className="w-14"
        value={multiplier}
        onChange={(e) => setMultiplier(e.target.value)}
      />
      <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void link()}>
        Bağla
      </Button>
    </div>
  );
}

export function UnmatchedCardsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
      dismissed: String(showDismissed),
    });
    fetch(`/api/brand/unmatched?${params.toString()}`)
      .then((r) => r.json())
      .then((body: Data & { error?: string }) => {
        if (body.error) setLoadError(body.error);
        else setData(body);
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Kartlar okunamadı.'));
  }, [page, pageSize, showDismissed]);

  useEffect(load, [load]);

  async function act(cardId: string, request: () => Promise<Response>) {
    setBusy(cardId);
    setActionError(null);
    try {
      const response = await request();
      if (!response.ok) setActionError(await failure(response, 'İşlem yapılamadı'));
      load();
    } finally {
      setBusy(null);
    }
  }

  const dismiss = (card: UnmatchedCard, dismissed: boolean) =>
    act(card.id, () =>
      fetch('/api/brand/unmatched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [card.id], dismissed }),
      }),
    );

  const toggleFavourite = (card: UnmatchedCard) =>
    act(card.id, () =>
      fetch('/api/tracked-products/favourite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.id, isFavourite: !card.isFavourite }),
      }),
    );

  const nowMs = Date.now();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Eşleşmemiş Kartlar"
        breadcrumb={[{ label: 'Marka Denetimi' }, { label: 'Eşleşmemiş Kartlar' }]}
        description="Markalarınızın pazaryeri taramasında bulunan ama hiçbir stok ürününüze bağlı olmayan kartlar. Bağlı olmayan kartın bandı, dolayısıyla alarmı yoktur."
      />

      <Section
        id="brand-unmatched"
        title={showDismissed ? 'Kenara alınanlar' : 'Kuyruk'}
        action={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setShowDismissed(!showDismissed);
              setPage(0);
            }}
          >
            {showDismissed ? 'Kuyruğa dön' : 'Kenara alınanlar'}
          </Button>
        }
      >
        {data !== null && !showDismissed && data.total > 0 && (
          <p className="mb-2 text-sm">
            Toplam <strong>{formatNumber(data.total)}</strong> kart.{' '}
            {data.newCount > 0 && (
              <span className="text-(--color-warning)">
                Son {Math.round(data.newWindowMs / 86_400_000)} günde {formatNumber(data.newCount)} yeni kart.
              </span>
            )}{' '}
            <span className="text-(--color-muted)">Çok değerlendirilen (çok satan) kart önce gelir.</span>
          </p>
        )}
        {actionError && <p className="mb-2 text-sm text-(--color-danger)">{actionError}</p>}

        {loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : data === null ? (
          <LoadingState message="Kartlar yükleniyor…" skeletonRows={5} />
        ) : data.cards.length === 0 ? (
          <EmptyState
            message={showDismissed ? 'Kenara alınan kart yok.' : 'Eşleşmemiş kart yok.'}
            reason={
              showDismissed
                ? undefined
                : 'Markalarınızın taramasında bulunan kartların hepsi bir stok ürününe bağlı ya da kenara alınmış. Marka eklemek için İzlenen Markalar ekranına bakın.'
            }
          />
        ) : (
          <>
            <TableFrame>
              <table className="w-full text-sm">
                <thead className={STICKY_HEAD}>
                  <tr className="text-left">
                    <th className="p-2">Kart</th>
                    <th className="p-2">Marka</th>
                    <th className="p-2 text-right">Değerlendirme</th>
                    <th className="p-2">Satıcı</th>
                    <th className="p-2">İlk görülme</th>
                    <th className="p-2">Öneri</th>
                    <th className="p-2">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cards.map((card) => {
                    const url = marketplaceProductUrl(card.marketplaceCode, card.productUrl);
                    const isNew = nowMs - card.addedAt < data.newWindowMs;
                    return (
                      <tr key={card.id} className="border-t border-(--color-border) align-top">
                        <td className="p-2">
                          <span>{card.label}</span>
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              title="Pazaryerindeki ürün sayfası"
                              className="ml-1 text-(--color-muted) hover:text-(--color-accent)"
                            >
                              ↗
                            </a>
                          )}
                          <span className="ml-2 text-xs text-(--color-muted)">
                            {labelOf(MARKETPLACE_LABELS, card.marketplaceCode)}
                          </span>
                          {card.barcode && (
                            <div className="text-xs text-(--color-muted)">Barkod {card.barcode}</div>
                          )}
                        </td>
                        <td className="p-2">{card.watchedBrandLabel}</td>
                        <td className="p-2 text-right tabular-nums">
                          {card.ratingCount === null ? '—' : formatNumber(card.ratingCount)}
                        </td>
                        <td className="p-2 text-xs">
                          {card.hasSellers === null ? (
                            <span className="text-(--color-muted)">bakılmadı</span>
                          ) : card.hasSellers ? (
                            'satılıyor'
                          ) : (
                            <span className="text-(--color-muted)">satan yok</span>
                          )}
                        </td>
                        <td className="p-2 text-xs">
                          <Ago at={card.addedAt} />
                          {isNew && (
                            <span className="ml-1 rounded bg-(--color-warning-bg) px-1 text-(--color-warning)">yeni</span>
                          )}
                        </td>
                        <td className="p-2">
                          <PermissionFieldset permission="catalogue.manage">
                            {card.suggestions.length > 0 ? (
                              <SuggestionLink
                                card={card}
                                onDone={(error) => {
                                  setActionError(error);
                                  load();
                                }}
                              />
                            ) : (
                              <span className="text-xs text-(--color-muted)">
                                Barkod eşleşmesi yok.{' '}
                                <Link className="underline" href="/brand/products">
                                  Stok
                                </Link>{' '}
                                ekranındaki ürüne bu kartı bağlayabilirsiniz.
                              </span>
                            )}
                          </PermissionFieldset>
                        </td>
                        <td className="p-2">
                          <PermissionFieldset permission="catalogue.manage">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy === card.id}
                                title="İlanlar ekranına ekler; bağlanmadan da izleyebilirsiniz"
                                onClick={() => void toggleFavourite(card)}
                              >
                                {card.isFavourite ? '★ İlanlarda' : '☆ İlanlara ekle'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy === card.id}
                                onClick={() => void dismiss(card, !showDismissed)}
                              >
                                {showDismissed ? 'Kuyruğa geri al' : 'Bizim değil'}
                              </Button>
                            </div>
                          </PermissionFieldset>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableFrame>
            <Pagination state={{ page, pageSize, total: data.total, setPage, setPageSize }} label="kart" />
          </>
        )}
      </Section>
    </div>
  );
}
