/**
 * The band-violation message (doc 17 §6, build plan 11.7). Pure, and exported so the wording is
 * testable without a network — this is where the product speaks to someone who is not looking at
 * the screen's caveats.
 *
 * Only **openings** are told; continuations and resolutions are not (doc 17 §6): a resolution
 * fires on every threshold edit and teaches people to ignore the channel.
 */
import type { NotificationMessage } from '@buybox/adapters';
import type { bandViolationsRepo } from '@buybox/db';
import { MAX_VIOLATIONS_PER_MESSAGE } from '../notify-config.js';

const KIND_TEXT = { belowMin: 'min altında', aboveMax: 'max üstünde' } as const;

/** Kuruş → `1.234,56 ₺`, in `bigint` throughout: money never routes through a float. */
export function formatLira(kurus: bigint): string {
  const negative = kurus < 0n;
  const abs = negative ? -kurus : kurus;
  const lira = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${lira},${String(abs % 100n).padStart(2, '0')} ₺`;
}

export function formatBandViolationMessage(
  violations: readonly bandViolationsRepo.BandViolationListRow[],
): NotificationMessage {
  const total = violations.length;
  const shown = violations.slice(0, MAX_VIOLATIONS_PER_MESSAGE);
  const omitted = total - shown.length;
  const headline = `${total} yeni fiyat ihlali`;

  const lines = [`${headline} — buybox'taki satıcı bandın dışında`, ''];
  for (const v of shown) {
    // Brand roadmap §6.7: a breach the coupon alone made is a different talk with the dealer.
    const coupon =
      v.basis === 'coupon' ? ' (yalnız kuponla; raf fiyatı bantta)' : v.priceSource === 'finalPrice' ? ' (kuponlu)' : '';
    const pack = v.unitMultiplier === 1 ? '' : ` ×${v.unitMultiplier}`;
    lines.push(
      `• ${v.brandProductName} — ${v.cardLabel}${pack} (${v.marketplaceCode}): ${KIND_TEXT[v.kind]}, ` +
        `${v.sellerName || 'satıcı adı yok'} ${formatLira(v.observedPrice)}${coupon}, sınır ${formatLira(v.thresholdApplied)}`,
    );
  }
  if (omitted > 0) lines.push(`• …ve ${omitted} ihlal daha.`);
  lines.push('');
  lines.push('Fiyatlar pazaryerinin herkese açık ürün sayfasından okunmuştur. Ayrıntı: Marka Denetimi → Alarmlar.');

  return {
    subject: headline,
    text: lines.join('\n'),
    shortText: `${headline} — Alarmlar ekranına bakın`,
    items: shown.map((v) => ({
      id: v.id,
      brandProduct: v.brandProductName,
      card: v.cardLabel,
      marketplace: v.marketplaceCode,
      kind: v.kind,
      seller: v.sellerName,
      sellerRef: v.sellerRef,
      // Kuruş as a decimal string, as money crosses every wire in this system.
      price: v.observedPrice.toString(),
      priceSource: v.priceSource,
      basis: v.basis,
      threshold: v.thresholdApplied.toString(),
      unitMultiplier: v.unitMultiplier,
      firstSeenAt: v.firstSeenAt,
    })),
    omitted,
  };
}
