import type { bandViolationsRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import { parseNotificationRecipients } from '../notify-config.js';
import { formatBandViolationMessage, formatLira } from './band-notifications.js';

function violation(i: number, overrides: Partial<bandViolationsRepo.BandViolationListRow> = {}) {
  return {
    id: `v${i}`,
    brandProductId: 'bp',
    trackedProductId: 'tp',
    kind: 'belowMin',
    sellerRef: '9',
    sellerName: 'Ucuzcu',
    state: 'open',
    firstSeenAt: 0,
    lastSeenAt: 0,
    resolvedAt: null,
    resolution: null,
    thresholdApplied: 160_00n,
    unitMultiplier: 1,
    observedPrice: 150_00n,
    priceSource: 'price',
    snapshot: '[]',
    brandProductName: 'Ton 85g',
    cardLabel: 'Kart',
    cardUrl: '/x',
    marketplaceCode: 'trendyol',
    ...overrides,
  } as bandViolationsRepo.BandViolationListRow;
}

describe('formatLira', () => {
  it.each([
    [0n, '0,00 ₺'],
    [5n, '0,05 ₺'],
    [150_00n, '150,00 ₺'],
    [1_234_567_89n, '1.234.567,89 ₺'],
  ])('%s → %s', (kurus, text) => {
    expect(formatLira(kurus)).toBe(text);
  });
});

describe('formatBandViolationMessage', () => {
  it('names product, card, kind, seller, price and bound; marks a coupon price and a pack', () => {
    const message = formatBandViolationMessage([
      violation(1, { priceSource: 'finalPrice', unitMultiplier: 3, kind: 'aboveMax' }),
    ]);
    expect(message.subject).toBe('1 yeni fiyat ihlali');
    expect(message.shortText).toBe('1 yeni fiyat ihlali — Alarmlar ekranına bakın');
    expect(message.text).toContain('• Ton 85g — Kart ×3 (trendyol): max üstünde, Ucuzcu 150,00 ₺ (kuponlu), sınır 160,00 ₺');
    expect(message.items).toEqual([expect.objectContaining({ id: 'v1', price: '15000', threshold: '16000' })]);
    expect(message.omitted).toBe(0);
  });

  it('caps the list at 10 and counts the rest', () => {
    const message = formatBandViolationMessage(Array.from({ length: 13 }, (_, i) => violation(i)));
    expect(message.subject).toBe('13 yeni fiyat ihlali');
    expect(message.items).toHaveLength(10);
    expect(message.omitted).toBe(3);
    expect(message.text).toContain('…ve 3 ihlal daha.');
  });
});

describe('parseNotificationRecipients', () => {
  it.each([
    { name: 'empty', input: {}, expected: { email: [], sms: [] } },
    {
      name: 'trims, lower-cases and de-duplicates e-mail',
      input: { email: [' Ali@X.com ', 'ali@x.com', ''] },
      expected: { email: ['ali@x.com'], sms: [] },
    },
    {
      name: 'Turkish mobile typed locally becomes E.164',
      input: { sms: ['0532 123 45 67', '5321234567', '+905321234567'] },
      expected: { email: [], sms: ['+905321234567'] },
    },
  ])('$name', ({ input, expected }) => {
    expect(parseNotificationRecipients(input)).toEqual(expected);
  });

  it('reports every bad entry', () => {
    expect(parseNotificationRecipients({ email: ['nope'], sms: ['12'] })).toEqual({
      errors: ['Geçersiz e-posta adresi: nope', 'Geçersiz telefon numarası: +9012'],
    });
  });
});
