/**
 * This adapter is intentionally blocked (see adapter.ts's class doc) — these tests assert the
 * block itself, not marketplace behaviour. It deliberately does **not** run the shared
 * marketplace contract suite: that suite requires real data operations to succeed, and making
 * it pass here would mean guessing at the 🔴 schemas in api-references.md §2.9, which is
 * exactly what CLAUDE.md's "Rule: marketplace API work" forbids.
 */
import { describe, expect, it } from 'vitest';
import { HepsiburadaAdapter, HepsiburadaBlockedError } from './adapter.js';

describe('HepsiburadaAdapter (blocked pending api-references §2.9)', () => {
  const adapter = new HepsiburadaAdapter();

  it('reports capabilities honestly: only the one hard-verified number is real', () => {
    expect(adapter.capabilities.dailyUpdateAllowance(1000)).toBe(10_000); // §2.3, verified
    expect(adapter.capabilities.competitorPriceDepth).toBe(0); // §2.5 unconfirmed — not guessed
  });

  it('testConnection fails with a specific reason rather than pretending to succeed', async () => {
    const result = await adapter.testConnection({});
    expect(result.ok).toBe(false);
  });

  it('fetchListings throws HepsiburadaBlockedError naming the unresolved checklist item', async () => {
    await expect(async () => {
      for await (const _l of adapter.fetchListings()) {
        // never reached
      }
    }).rejects.toBeInstanceOf(HepsiburadaBlockedError);
  });

  it('fetchBuyboxObservations, submitPriceChanges and pollSubmission all throw the same way', async () => {
    await expect(adapter.fetchBuyboxObservations(['x'])).rejects.toBeInstanceOf(HepsiburadaBlockedError);
    await expect(adapter.submitPriceChanges([])).rejects.toBeInstanceOf(HepsiburadaBlockedError);
    await expect(adapter.pollSubmission({ batchId: 'x', submittedAt: new Date() })).rejects.toBeInstanceOf(
      HepsiburadaBlockedError,
    );
  });
});
