'use client';

/**
 * One brand product: its cards, their multipliers, which card is primary, and the barcode
 * suggestions (doc 17 §2.4).
 *
 * Two rules from the spec are visible in the interaction rather than only enforced behind it:
 *
 * - **The multiplier is asked, never defaulted.** The add-card field starts empty and the form
 *   refuses to submit without it. A pre-filled 1 is a question nobody reads, and the multiplier
 *   is what every band comparison for that card is scaled by.
 * - **A suggestion is an offer, not a link.** _Bu kart senin ürünün olabilir_ fills the card in
 *   and still asks the multiplier; nothing is linked until the operator presses the button.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import {
  Ago,
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
import { formatMoney } from '@/lib/format';

interface Product {
  id: string;
  name: string;
  referencePrice: string;
  minPrice: string | null;
  maxPrice: string | null;
  upperBound: string;
  upperBoundIsReferencePrice: boolean;
  barcode: string | null;
  source: string;
  referencePriceSource: string | null;
  updatedAt: number;
}

interface Card {
  id: string;
  trackedProductId: string;
  marketplaceCode: string;
  label: string;
  productRef: string;
  productUrl: string;
  unitMultiplier: number;
  isPrimary: boolean;
  linkSource: string;
  isActive: boolean;
  barcode: string | null;
  lastScrapedAt: number | null;
  hasSellers: boolean | null;
  /** The per-unit thresholds scaled to this card — computed server-side, never by dividing. */
  cardReferencePrice: string;
  cardMinPrice: string | null;
  cardUpperBound: string;
}

interface Suggestion {
  id: string;
  marketplaceCode: string;
  label: string;
  productRef: string;
  productUrl: string;
}

const LINK_SOURCE_LABEL: Record<string, string> = {
  manual: 'el ile',
  excel: 'Excel',
  barcodeSuggestion: 'barkod önerisi',
  migration: 'taşıma',
};

export function BrandProductDetailClient({ id }: { id: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // The add-card form. `link` and `trackedProductId` are the two ways in; a suggestion fills the
  // second. The multiplier is deliberately a string so "empty" stays distinguishable from 1.
  const [link, setLink] = useState('');
  const [pickedCard, setPickedCard] = useState<Suggestion | null>(null);
  const [multiplier, setMultiplier] = useState('');
  const [asPrimary, setAsPrimary] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/brand-products/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? 'Ürün okunamadı.');
        return r.json() as Promise<{ product: Product; cards: Card[]; suggestions: Suggestion[] }>;
      })
      .then((d) => {
        setProduct(d.product);
        setCards(d.cards);
        setSuggestions(d.suggestions);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  async function addCard() {
    const count = Number(multiplier);
    if (!Number.isSafeInteger(count) || count < 1) {
      setNotice({ ok: false, message: 'Adet çarpanı 1 veya daha büyük bir tam sayı olmalı.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/brand-products/${id}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackedProductId: pickedCard?.id,
          link: pickedCard ? undefined : link,
          unitMultiplier: count,
          isPrimary: asPrimary,
          linkSource: pickedCard ? 'barcodeSuggestion' : 'manual',
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; demotedCardId?: string | null };
      if (!res.ok) {
        setNotice({ ok: false, message: data.error ?? 'Kart bağlanamadı.' });
        return;
      }
      setNotice({
        ok: true,
        message: data.demotedCardId
          ? 'Kart bağlandı ve bu pazaryerinin birincil kartı oldu; öncekisi bağlı kalmaya devam ediyor.'
          : 'Kart bağlandı.',
      });
      setLink('');
      setPickedCard(null);
      setMultiplier('');
      setAsPrimary(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function patchCard(cardId: string, body: { unitMultiplier?: number; isPrimary?: boolean }) {
    const res = await fetch(`/api/brand-products/${id}/cards`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, ...body }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setNotice(
      res.ok
        ? { ok: true, message: 'Kart güncellendi.' }
        : { ok: false, message: data.error ?? 'Güncellenemedi.' },
    );
    load();
  }

  async function unlink(cardId: string) {
    await fetch(`/api/brand-products/${id}/cards?cardId=${encodeURIComponent(cardId)}`, { method: 'DELETE' });
    setNotice({ ok: true, message: 'Kart bağı kaldırıldı. Kart takip listesinde kalmaya devam ediyor.' });
    load();
  }

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (loading || !product) return <LoadingState message="Ürün yükleniyor…" skeletonRows={4} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={product.name}
        description={
          <>
            Birim PSF <strong>{formatMoney(BigInt(product.referencePrice))}</strong>
            {' · '}
            min{' '}
            {product.minPrice === null ? (
              <span title="Alt sınır alarmı yok">—</span>
            ) : (
              <strong>{formatMoney(BigInt(product.minPrice))}</strong>
            )}
            {' · '}
            üst sınır <strong>{formatMoney(BigInt(product.upperBound))}</strong>
            {product.upperBoundIsReferencePrice && ' (max girilmemiş, PSF geçerli)'}
            {product.barcode && ` · barkod ${product.barcode}`}
          </>
        }
        action={
          <Link className="text-sm underline" href="/brand/products">
            Stok listesine dön
          </Link>
        }
      />

      {notice && <StatusBanner ok={notice.ok} message={notice.message} />}

      <Section id="cards" title="Bağlı kartlar">
        {cards.length === 0 ? (
          <EmptyState
            message="Bu ürüne bağlı kart yok."
            reason="Bir pazaryeri kartı bağlanana kadar bu ürün için ne fiyat izlenir ne de alarm üretilir."
          />
        ) : (
          <TableFrame>
            <table className="w-full text-sm">
              <thead className={STICKY_HEAD}>
                <tr className="text-left">
                  <th className="p-2">Pazaryeri</th>
                  <th className="p-2">Kart</th>
                  <th className="p-2">Çarpan</th>
                  <th className="p-2">Kart PSF</th>
                  <th className="p-2">Kart alt/üst</th>
                  <th className="p-2">Birincil</th>
                  <th className="p-2">Bağ</th>
                  <th className="p-2">Son bakış</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.id} className="border-t border-(--color-border)">
                    <td className="p-2">{card.marketplaceCode}</td>
                    <td className="p-2">
                      <a className="underline" href={card.productUrl} target="_blank" rel="noreferrer">
                        {card.label}
                      </a>
                      <div className="text-xs text-(--color-muted)">
                        {card.productRef}
                        {!card.isActive && ' · pasif'}
                        {card.hasSellers === false && ' · satıcısız'}
                      </div>
                    </td>
                    <td className="p-2">
                      <MultiplierCell
                        value={card.unitMultiplier}
                        onChange={(next) => void patchCard(card.id, { unitMultiplier: next })}
                      />
                    </td>
                    {/* Card-level, so it is directly comparable with the card's own price — the
                        threshold is multiplied, the price is never divided (doc 17 §2.2). */}
                    <td className="p-2 tabular-nums">{formatMoney(BigInt(card.cardReferencePrice))}</td>
                    <td className="p-2 tabular-nums">
                      {card.cardMinPrice === null ? '—' : formatMoney(BigInt(card.cardMinPrice))}
                      {' / '}
                      {formatMoney(BigInt(card.cardUpperBound))}
                    </td>
                    <td className="p-2">
                      {card.isPrimary ? (
                        <span title="Excel içe aktarımında bu ürünü bulan kart">evet</span>
                      ) : (
                        <Button
                          variant="secondary"
                          type="button"
                          className="px-2! py-1! text-xs"
                          onClick={() => void patchCard(card.id, { isPrimary: true })}
                        >
                          Birincil yap
                        </Button>
                      )}
                    </td>
                    <td className="p-2 text-xs">{LINK_SOURCE_LABEL[card.linkSource] ?? card.linkSource}</td>
                    <td className="p-2 text-xs">
                      <Ago at={card.lastScrapedAt} never="hiç bakılmadı" />
                    </td>
                    <td className="p-2 text-right">
                      <ConfirmButton
                        requireConfirm
                        confirmMessage="Kart bağı kaldırılsın mı? Kart takip listesinde kalır."
                        className="rounded border border-(--color-border) px-2 py-1 text-xs"
                        onConfirmed={() => void unlink(card.id)}
                      >
                        Bağı kaldır
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </Section>

      <Section id="add-card" title="Kart ekle">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Ürün linki" hint="Trendyol veya Hepsiburada ürün sayfası">
            <TextInput
              value={pickedCard ? `${pickedCard.marketplaceCode} · ${pickedCard.label}` : link}
              onChange={(e) => {
                setPickedCard(null);
                setLink(e.target.value);
              }}
              placeholder="https://www.trendyol.com/…-p-123456"
              className="w-96"
            />
          </Field>
          <Field label="Adet çarpanı" hint="Bir alışta kaç birim gider?">
            <TextInput
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              inputMode="numeric"
              placeholder="örn. 3"
              className="w-28"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={asPrimary} onChange={(e) => setAsPrimary(e.target.checked)} />
            Bu pazaryerinde birincil kart olsun
          </label>
          <Button type="button" disabled={busy} onClick={() => void addCard()}>
            {busy ? 'Bağlanıyor…' : 'Bağla'}
          </Button>
        </div>
        {pickedCard && (
          <p className="mt-2 text-xs text-(--color-muted)">
            Öneriden seçildi: {pickedCard.productRef}.{' '}
            <button type="button" className="underline" onClick={() => setPickedCard(null)}>
              Vazgeç
            </button>
          </p>
        )}
      </Section>

      <Section id="suggestions" title="Bu kart senin ürünün olabilir">
        {suggestions.length === 0 ? (
          <EmptyState
            message="Öneri yok."
            reason={
              product.barcode
                ? 'Bu barkodu taşıyan, henüz bir ürüne bağlanmamış kart bulunmadı.'
                : 'Öneriler barkodla bulunur; bu üründe barkod yazılı değil. Trendyol kartları barkod vermez, Hepsiburada verir.'
            }
          />
        ) : (
          <ul className="space-y-2 text-sm">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.id}
                className="flex flex-wrap items-center gap-3 rounded border border-(--color-border) p-2"
              >
                <span className="text-xs text-(--color-muted)">{suggestion.marketplaceCode}</span>
                <a className="underline" href={suggestion.productUrl} target="_blank" rel="noreferrer">
                  {suggestion.label}
                </a>
                <Button
                  variant="secondary"
                  type="button"
                  className="ml-auto px-2! py-1! text-xs"
                  onClick={() => {
                    // Fills the form and scrolls the multiplier into view: accepting a suggestion
                    // still has to answer "kaç adet?" before anything is written.
                    setPickedCard(suggestion);
                    setMultiplier('');
                    setNotice({ ok: true, message: 'Kart seçildi. Adet çarpanını yazıp Bağla deyin.' });
                  }}
                >
                  Bunu bağla
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/** An inline multiplier editor: it only writes when the value actually changed and is valid. */
function MultiplierCell({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      value={text}
      inputMode="numeric"
      aria-label="Adet çarpanı"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = Number(text);
        if (!Number.isSafeInteger(next) || next < 1) {
          setText(String(value));
          return;
        }
        if (next !== value) onChange(next);
      }}
      className="w-16 rounded border border-(--color-border) px-2 py-1 text-sm tabular-nums"
    />
  );
}
