/**
 * The notification's wording and transport (2026-09-03).
 *
 * The wording is tested because a notification is the one place this product speaks to someone
 * who is *not* looking at the screen and its caveats. A message that reads as an accusation is a
 * legal problem the screen's careful language does nothing to fix, and it is forwarded far more
 * readily than a dashboard is.
 */
import type { brandFindingsRepo } from '@buybox/db';
import { describe, expect, it, vi } from 'vitest';
import {
  formatFindingMessage,
  MAX_FINDINGS_PER_MESSAGE,
  WebhookFindingNotifier,
} from './findings-notifier.js';

function finding(over: Partial<brandFindingsRepo.BrandFindingRow> = {}): brandFindingsRepo.BrandFindingRow {
  return {
    id: 'f1',
    watchedBrandId: 'b1',
    findingKey: 'blockedSellerPresent::trendyol::111',
    kind: 'blockedSellerPresent',
    basis: 'stated',
    state: 'open',
    magnitude: 5,
    firstSeenAt: 1_800_000_000_000,
    lastSeenAt: 1_800_000_000_000,
    resolvedAt: null,
    notifiedAt: null,
    payload: JSON.stringify({ subject: { kind: 'seller', name: 'Periko Petshop' } }),
    ...over,
  };
}

describe('formatFindingMessage', () => {
  it('names the brand, the count and each finding with its basis', () => {
    const text = formatFindingMessage({
      brandLabel: 'Whiskas',
      findings: [finding()],
      omitted: 0,
    });
    expect(text).toContain('Whiskas — 1 yeni denetim bulgusu');
    expect(text).toContain('Yasaklı satıcı satışta — Periko Petshop (kesin bilgi)');
  });

  /**
   * The sentence that has to survive being forwarded on its own. Everything else in this message
   * is a number; this is the only part that says what the numbers are *not*.
   */
  it('always says a finding is not a claim of wrongdoing', () => {
    const text = formatFindingMessage({ brandLabel: 'Whiskas', findings: [finding()], omitted: 0 });
    expect(text).toContain('Bir bulgu ihlal iddiası değildir');
  });

  it('reads a product-subject finding by its label', () => {
    const text = formatFindingMessage({
      brandLabel: 'Whiskas',
      findings: [
        finding({
          kind: 'belowReferencePrice',
          payload: JSON.stringify({ subject: { kind: 'product', label: 'Whiskas 1,4 Kg' } }),
        }),
      ],
      omitted: 0,
    });
    expect(text).toContain('Tavsiye fiyatın altında — Whiskas 1,4 Kg');
  });

  it('counts what it left out rather than pasting hundreds of lines', () => {
    const text = formatFindingMessage({
      brandLabel: 'Whiskas',
      findings: [finding()],
      omitted: 40,
    });
    expect(text).toContain('Whiskas — 41 yeni denetim bulgusu');
    expect(text).toContain('…ve 40 bulgu daha.');
  });

  /**
   * An unparseable payload is a bug worth not crashing a notification over: the kind and the
   * count are still worth sending, and the screen holds the rest.
   */
  it('still names the finding when its payload cannot be read', () => {
    const text = formatFindingMessage({
      brandLabel: 'Whiskas',
      findings: [finding({ payload: 'not json' })],
      omitted: 0,
    });
    expect(text).toContain('Yasaklı satıcı satışta');
  });

  it('caps at a readable number of findings per message', () => {
    // A message nobody reads is the same failure as sending nothing, arrived at more expensively.
    expect(MAX_FINDINGS_PER_MESSAGE).toBeLessThanOrEqual(20);
  });
});

describe('WebhookFindingNotifier', () => {
  it('posts the text and a structured list to the configured url', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    const notifier = new WebhookFindingNotifier('https://hooks.example.com/x', fetchImpl as never);

    await notifier.send({ brandLabel: 'Whiskas', findings: [finding()], omitted: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://hooks.example.com/x');
    const body = JSON.parse((init as RequestInit).body as string) as {
      text: string;
      count: number;
      findings: { kind: string }[];
    };
    expect(body.count).toBe(1);
    expect(body.findings[0]!.kind).toBe('blockedSellerPresent');
    expect(body.text).toContain('Whiskas');
  });

  /**
   * Rejecting is the contract: the caller leaves `notified_at` null and retries. Resolving on a
   * 500 would mark the finding as delivered and lose it for good.
   */
  it('rejects on a non-2xx response rather than reporting success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    const notifier = new WebhookFindingNotifier('https://hooks.example.com/x', fetchImpl as never);

    await expect(notifier.send({ brandLabel: 'Whiskas', findings: [finding()], omitted: 0 })).rejects.toThrow(
      '500',
    );
  });
});
