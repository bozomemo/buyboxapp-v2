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
import { Ago, Button, EmptyState, ErrorState, LoadingState, PageHeader, Section, Select, TextInput } from '@/components/ui';
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
  /** Own brands for the filter, and stock products for "Ürüne bağla". Absent from an older server. */
  brands?: { id: string; label: string }[];
  products?: { id: string; name: string }[];
}

/**
 * "Ürüne bağla" for a card with no barcode suggestion (review 2026-11-25 O4): before this the
 * operator copied the card's link, opened the product and pasted it there. The multiplier is still
 * asked — empty by default, as on the product screen (doc 17 §2.4).
 */
function DirectLink({
  card,
  products,
  onDone,
}: {
  card: UnmatchedCard;
  products: { id: string; name: string }[];
  onDone: (error: string | null) => void;
}) {
  const [productId, setProductId] = useState('');
  const [multiplier, setMultiplier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link() {
    const count = Number(multiplier);
    if (productId === '') {
      setError('Bir stok ürünü seçin.');
      return;
    }
    if (!Number.isSafeInteger(count) || count < 1) {
      setError("Bu kartta kaç birim satılıyor? Tek ürünse 1, 3'lü paketse 3 yazın.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/brand-products/${productId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackedProductId: card.id, unitMultiplier: count, linkSource: 'manual' }),
      });
      onDone(response.ok ? null : await failure(response, 'Kart bağlanamadı'));
    } finally {
      setBusy(false);
    }
  }

  if (products.length === 0) {
    return (
      <span className="text-xs text-(--color-muted)">
        Henüz stok ürünü yok.{' '}
        <Link className="underline" href="/brand/products">
          Stok
        </Link>{' '}
        ekranından ekleyin.
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Stok ürünü"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          options={[{ value: '', label: 'Stok ürünü seçin…' }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
          className="max-w-56"
        />
        <span className="text-xs text-(--color-muted)">×</span>
        <TextInput
          aria-label="Adet çarpanı"
          inputMode="numeric"
          placeholder="adet"
          className="w-14"
          value={multiplier}
          onChange={(e) => setMultiplier(e.target.value)}
        />
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void link()}>
          Ürüne bağla
        </Button>
      </div>
      {error && (
        <span role="alert" className="text-xs text-(--color-danger)">
          {error}
        </span>
      )}
    </div>
  );
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
  // Review 2026-11-25 O4/O5: search, brand filter, a ticked selection and an undo.
  const [textDraft, setTextDraft] = useState('');
  const [text, setText] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ ids: string[]; label: string } | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
      dismissed: String(showDismissed),
    });
    if (text.trim()) params.set('text', text.trim());
    if (brandFilter) params.set('watchedBrandId', brandFilter);
    fetch(`/api/brand/unmatched?${params.toString()}`)
      .then((r) => r.json())
      .then((body: Data & { error?: string }) => {
        if (body.error) setLoadError(body.error);
        else setData(body);
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Kartlar okunamadı.'));
  }, [page, pageSize, showDismissed, text, brandFilter]);

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

  const postDismissed = (ids: string[], dismissed: boolean) =>
    fetch('/api/brand/unmatched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, dismissed }),
    });

  /** Set aside, with an undo rather than a confirmation: the move is reversible (review O5). */
  async function dismissIds(ids: string[], label: string, dismissed: boolean) {
    await act(ids[0]!, () => postDismissed(ids, dismissed));
    setSelected(new Set());
    setUndo(dismissed ? { ids, label } : null);
  }

  const dismiss = (card: UnmatchedCard, dismissed: boolean) => dismissIds([card.id], `“${card.label}”`, dismissed);

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
            {showDismissed ? 'Kuyruğu göster' : 'Kenara alınanlar'}
          </Button>
        }
      >
        <form
          role="search"
          className="mb-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setText(textDraft);
            setPage(0);
          }}
        >
          <TextInput
            type="search"
            aria-label="Kartlarda ara"
            placeholder="Kart adı, ürün kodu ya da barkod"
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            className="w-72"
          />
          <Button type="submit" size="sm" variant="secondary">
            Ara
          </Button>
          {(data?.brands?.length ?? 0) > 1 && (
            <Select
              aria-label="Marka"
              value={brandFilter}
              onChange={(e) => {
                setBrandFilter(e.target.value);
                setPage(0);
              }}
              options={[{ value: '', label: 'Tüm markalar' }, ...data!.brands!.map((b) => ({ value: b.id, label: b.label }))]}
            />
          )}
          {selected.size > 0 && !showDismissed && (
            <PermissionFieldset permission="catalogue.manage">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void dismissIds([...selected], `${formatNumber(selected.size)} kart`, true)}
              >
                {`Seçilen ${formatNumber(selected.size)} kart bizim değil`}
              </Button>
            </PermissionFieldset>
          )}
        </form>
        {undo && (
          <p role="status" className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span>{undo.label} kenara alındı.</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const ids = undo.ids;
                setUndo(null);
                void act(ids[0]!, () => postDismissed(ids, false));
              }}
            >
              Geri al
            </Button>
          </p>
        )}
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
                    {!showDismissed && <th className="w-8 p-2" aria-label="Seçim" />}
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
                        {!showDismissed && (
                          <td className="p-2">
                            <input
                              type="checkbox"
                              aria-label={`${card.label} seç`}
                              checked={selected.has(card.id)}
                              onChange={(e) =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(card.id);
                                  else next.delete(card.id);
                                  return next;
                                })
                              }
                            />
                          </td>
                        )}
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
                              <DirectLink
                                card={card}
                                products={data.products ?? []}
                                onDone={(error) => {
                                  setActionError(error);
                                  load();
                                }}
                              />
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
