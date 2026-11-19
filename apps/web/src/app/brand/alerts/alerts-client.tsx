'use client';

/**
 * Alarmlar (marka) — price-band violations (doc 17 §5.4, build plan 11.6).
 *
 * A violation is the **buybox holder** of a card linked to one of your products, selling outside
 * that product's band. It opens on the first look that shows it, stays one row while later looks
 * confirm it, and resolves when a look shows otherwise. This screen lists the open ones grouped
 * by product, then those resolved in the last week.
 *
 * The freshness banner comes first on purpose, as on the seller's Alarmlar: no open violations
 * beside a listings lane that has not read anything in hours means "we have not looked".
 *
 * Money is kuruş as decimal strings over the wire and `bigint` here; only `formatMoney` turns it
 * into text. The threshold shown is the **card-level** bound the price was judged against (unit
 * bound × multiplier), as stored when the violation opened.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { STICKY_HEAD, TableFrame } from '@/components/table';
import { Download } from '@/components/icon';
import { Ago, Button, EmptyState, ErrorState, LoadingState, PageHeader, Section } from '@/components/ui';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatDuration, formatMoney, kurusToDecimal } from '@/lib/format';
import { marketplaceProductUrl } from '@/lib/product-url';
import { labelOf, MARKETPLACE_LABELS } from '@/lib/labels';

type Kind = 'belowMin' | 'aboveMax';
type Resolution = 'inBand' | 'buyboxChanged' | 'noOffers' | 'thresholdRemoved' | 'unlinked';

interface Violation {
  id: string;
  brandProductId: string;
  brandProductName: string;
  trackedProductId: string;
  cardLabel: string;
  cardUrl: string;
  marketplaceCode: string;
  kind: Kind;
  sellerRef: string | null;
  sellerName: string;
  state: 'open' | 'resolved';
  firstSeenAt: number;
  lastSeenAt: number;
  resolvedAt: number | null;
  resolution: Resolution | null;
  thresholdApplied: string;
  unitMultiplier: number;
  observedPrice: string;
  priceSource: 'finalPrice' | 'price';
  /** Absent from a server older than 11.7. */
  notifications?: { channel: 'webhook' | 'email' | 'sms'; state: 'pending' | 'sent' | 'failed' | 'suppressed'; reason: string | null }[];
}

interface Staleness {
  marketplaceCode: string;
  displayName: string;
  lastOkAt: number | null;
  stale: boolean;
}

interface Data {
  open: Violation[];
  resolved: Violation[];
  resolvedWindowMs: number;
  staleness: Staleness[];
  staleAfterMs: number;
}

const KIND_LABELS: Record<Kind, string> = { belowMin: 'Min altında', aboveMax: 'Max üstünde' };
const KIND_CLASS: Record<Kind, string> = {
  belowMin: 'text-(--color-danger) font-medium',
  aboveMax: 'text-(--color-warning) font-medium',
};
const RESOLUTION_LABELS: Record<Resolution, string> = {
  inBand: 'Banda döndü',
  buyboxChanged: 'Buybox el değiştirdi',
  noOffers: 'Satan kalmadı',
  thresholdRemoved: 'Min kaldırıldı',
  unlinked: 'Kart bağı kaldırıldı',
};

/** How far outside the bound, as a percentage of it — the figure a manager ranks by. */
function gapPct(v: Violation): string {
  const threshold = BigInt(v.thresholdApplied);
  if (threshold === 0n) return '';
  // Basis points in bigint, then one decimal for display; no float touches the money.
  const bp = ((BigInt(v.observedPrice) - threshold) * 10_000n) / threshold;
  const sign = bp > 0n ? '+' : bp < 0n ? '−' : '';
  const abs = bp < 0n ? -bp : bp;
  return `${sign}%${abs / 100n},${String((abs % 100n) / 10n)}`;
}

function cardLink(v: Violation) {
  const url = marketplaceProductUrl(v.marketplaceCode, v.cardUrl);
  return (
    <>
      <span>{v.cardLabel}</span>
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
      <span className="ml-2 text-xs text-(--color-muted)">{labelOf(MARKETPLACE_LABELS, v.marketplaceCode)}</span>
      {v.unitMultiplier !== 1 && <span className="ml-2 text-xs text-(--color-muted)">×{v.unitMultiplier}</span>}
    </>
  );
}

const CHANNEL_SHORT = { webhook: 'webhook', email: 'e-posta', sms: 'SMS' } as const;
const DELIVERY_SHORT = { pending: 'bekliyor', sent: '✓', failed: 'başarısız', suppressed: 'sessiz' } as const;

/**
 * Who was told, per channel. A channel with nobody configured shows as waiting with the reason on
 * hover, so an empty inbox is never mistaken for "nothing happened" (doc 07 §7.6).
 */
function notifiedCell(v: Violation) {
  const rows = v.notifications ?? [];
  if (rows.length === 0) return <span className="text-(--color-muted)">—</span>;
  return (
    <span className="text-xs">
      {rows.map((d, i) => (
        <span key={d.channel} title={d.reason ?? undefined} className={d.state === 'failed' ? 'text-(--color-danger)' : d.state === 'sent' ? '' : 'text-(--color-muted)'}>
          {i > 0 && ' · '}
          {CHANNEL_SHORT[d.channel]} {DELIVERY_SHORT[d.state]}
        </span>
      ))}
    </span>
  );
}

function priceCell(v: Violation) {
  return (
    <>
      {formatMoney(BigInt(v.observedPrice))}
      {v.priceSource === 'finalPrice' && (
        <span className="ml-1 text-xs text-(--color-muted)" title="Kupon sonrası fiyat">
          kuponlu
        </span>
      )}
    </>
  );
}

function exportRows(rows: Violation[]) {
  return rows.map((v) => ({
    'Stok Ürünü': v.brandProductName,
    Kart: v.cardLabel,
    Pazaryeri: v.marketplaceCode,
    Çarpan: v.unitMultiplier,
    İhlal: KIND_LABELS[v.kind],
    Satıcı: v.sellerName,
    'Satıcı Kodu': v.sellerRef ?? '',
    Fiyat: kurusToDecimal(v.observedPrice),
    'Fiyat Kaynağı': v.priceSource === 'finalPrice' ? 'kuponlu' : 'liste',
    Sınır: kurusToDecimal(v.thresholdApplied),
    Fark: gapPct(v),
    // Absolute, deliberately: an export is read later, when a relative time would be wrong.
    'İlk Görülme': formatDateTime(v.firstSeenAt),
    'Son Görülme': formatDateTime(v.lastSeenAt),
    Kapanış: v.resolvedAt === null ? '' : formatDateTime(v.resolvedAt),
    'Kapanış Nedeni': v.resolution === null ? '' : RESOLUTION_LABELS[v.resolution],
  }));
}

export function BrandAlertsClient() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    fetch('/api/brand/alerts')
      .then((r) => r.json())
      .then((body: Data & { error?: string }) => {
        if (body.error) setLoadError(body.error);
        else setData(body);
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Alarmlar okunamadı.'));
  }, []);

  useEffect(load, [load]);

  if (loadError) {
    return (
      <div className="p-6">
        <ErrorState message={loadError} onRetry={load} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6">
        <LoadingState message="Alarmlar yükleniyor…" skeletonRows={4} />
      </div>
    );
  }

  const stale = data.staleness.filter((s) => s.stale);
  const nowMs = Date.now();

  // Grouped by product: the API already orders open rows by product name, then oldest first.
  const groups: { productId: string; productName: string; rows: Violation[] }[] = [];
  for (const v of data.open) {
    const last = groups[groups.length - 1];
    if (last && last.productId === v.brandProductId) last.rows.push(v);
    else groups.push({ productId: v.brandProductId, productName: v.brandProductName, rows: [v] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alarmlar"
        breadcrumb={[{ label: 'Marka Denetimi' }, { label: 'Alarmlar' }]}
        description={
          <>
            Ürünlerinize bağlı kartlarda <strong>buybox&apos;taki satıcı</strong> bandınızın dışında
            satıyorsa burada görünür. Raporlamadır: hiçbir fiyatı değiştirmez.
          </>
        }
      />

      {/* First on the page on purpose: an empty list beside a lane that has not read anything is
          not good news, and must not look like it. */}
      {stale.length > 0 && (
        <div className="rounded border border-(--color-danger-border) bg-(--color-danger-bg) p-4">
          <h2 className="font-semibold text-(--color-danger)">Bu alarmlar güncel veriye dayanmıyor</h2>
          <ul className="mt-2 space-y-1 text-sm text-(--color-danger)">
            {stale.map((s) => (
              <li key={s.marketplaceCode}>
                <strong>{s.displayName}</strong>:{' '}
                {s.lastOkAt === null ? (
                  'ilanlar henüz hiç başarıyla taranmadı'
                ) : (
                  <>
                    son başarılı ilan taraması <Ago at={s.lastOkAt} />
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-(--color-danger)">
            Aşağıda alarm görünmemesi &ldquo;sorun yok&rdquo; anlamına gelmez; &ldquo;bakmadık&rdquo; anlamına
            gelir. <Link className="underline" href="/jobs">İşler</Link> ekranından İlan Taraması işinin
            açık ve çalışır olduğunu kontrol edin.
          </p>
        </div>
      )}

      <Section
        id="brand-open-violations"
        title={`Açık ihlaller (${data.open.length})`}
        action={
          data.open.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              type="button"
              onClick={() => downloadCsv('fiyat-ihlalleri.csv', exportRows(data.open))}
            >
              Excel&apos;e Aktar
            </Button>
          )
        }
      >
        {data.open.length === 0 ? (
          <EmptyState
            message="Açık ihlal yok."
            reason={
              stale.length > 0
                ? 'Yukarıdaki uyarıya göre veri güncel değil — bu "sorun yok" anlamına gelmez.'
                : data.staleness.length === 0
                  ? 'Henüz hiçbir ürününüze pazaryeri kartı bağlanmamış. Stok ekranından bağlayabilirsiniz.'
                  : 'Bağlı kartların hiçbirinde buybox satıcısı bandın dışında değil.'
            }
          />
        ) : (
          <TableFrame>
            <table className="w-full text-sm">
              <thead className={STICKY_HEAD}>
                <tr className="text-left">
                  <th className="p-2">Kart</th>
                  <th className="p-2">İhlal</th>
                  <th className="p-2">Buybox satıcı</th>
                  <th className="p-2 text-right">Fiyat</th>
                  <th className="p-2 text-right" title="Kartın sınırı: birim sınır × çarpan">
                    Sınır
                  </th>
                  <th className="p-2 text-right">Fark</th>
                  <th className="p-2">Süre</th>
                  <th className="p-2">Son görülme</th>
                  <th className="p-2">Bildirim</th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.productId}>
                  <tr className="border-t border-(--color-border) bg-(--color-bg)">
                    <td colSpan={9} className="p-2 font-medium">
                      <Link className="underline" href={`/brand/products/${group.productId}`}>
                        {group.productName}
                      </Link>
                      <span className="ml-2 text-xs text-(--color-muted)">{group.rows.length} ihlal</span>
                    </td>
                  </tr>
                  {group.rows.map((v) => (
                    <tr key={v.id} className="border-t border-(--color-border)">
                      <td className="p-2">{cardLink(v)}</td>
                      <td className={`p-2 ${KIND_CLASS[v.kind]}`}>{KIND_LABELS[v.kind]}</td>
                      <td className="p-2">{v.sellerName || '—'}</td>
                      <td className="p-2 text-right tabular-nums">{priceCell(v)}</td>
                      <td className="p-2 text-right tabular-nums">{formatMoney(BigInt(v.thresholdApplied))}</td>
                      <td className={`p-2 text-right tabular-nums ${KIND_CLASS[v.kind]}`}>{gapPct(v)}</td>
                      <td className="p-2 tabular-nums" title={`${formatDateTime(v.firstSeenAt)} tarihinden beri`}>
                        {formatDuration(nowMs - v.firstSeenAt)}
                      </td>
                      <td className="p-2 text-xs text-(--color-muted)">
                        <Ago at={v.lastSeenAt} />
                      </td>
                      <td className="p-2">{notifiedCell(v)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </TableFrame>
        )}
      </Section>

      <Section
        id="brand-resolved-violations"
        title={`Son ${Math.round(data.resolvedWindowMs / 86_400_000)} günde kapananlar (${data.resolved.length})`}
        action={
          data.resolved.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              type="button"
              onClick={() => downloadCsv('kapanan-fiyat-ihlalleri.csv', exportRows(data.resolved))}
            >
              Excel&apos;e Aktar
            </Button>
          )
        }
      >
        {data.resolved.length === 0 ? (
          <EmptyState message="Bu dönemde kapanan ihlal yok." />
        ) : (
          <TableFrame>
            <table className="w-full text-sm">
              <thead className={STICKY_HEAD}>
                <tr className="text-left">
                  <th className="p-2">Stok ürünü</th>
                  <th className="p-2">Kart</th>
                  <th className="p-2">İhlal</th>
                  <th className="p-2">Satıcı</th>
                  <th className="p-2 text-right">Son fiyat</th>
                  <th className="p-2 text-right">Sınır</th>
                  <th className="p-2">Süre</th>
                  <th className="p-2">Kapanış</th>
                </tr>
              </thead>
              <tbody>
                {data.resolved.map((v) => (
                  <tr key={v.id} className="border-t border-(--color-border)">
                    <td className="p-2">
                      <Link className="underline" href={`/brand/products/${v.brandProductId}`}>
                        {v.brandProductName}
                      </Link>
                    </td>
                    <td className="p-2">{cardLink(v)}</td>
                    <td className="p-2">{KIND_LABELS[v.kind]}</td>
                    <td className="p-2">{v.sellerName || '—'}</td>
                    <td className="p-2 text-right tabular-nums">{priceCell(v)}</td>
                    <td className="p-2 text-right tabular-nums">{formatMoney(BigInt(v.thresholdApplied))}</td>
                    <td className="p-2 tabular-nums">
                      {formatDuration((v.resolvedAt ?? v.lastSeenAt) - v.firstSeenAt)}
                    </td>
                    <td className="p-2 text-xs">
                      {v.resolution === null ? '—' : RESOLUTION_LABELS[v.resolution]}
                      <span className="ml-1 text-(--color-muted)">
                        · <Ago at={v.resolvedAt} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        )}
      </Section>
    </div>
  );
}
