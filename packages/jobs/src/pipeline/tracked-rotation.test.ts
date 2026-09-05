/**
 * Rotation priority (2026-09-03).
 *
 * Table-driven, because every mistake here is invisible in production: a starved product simply
 * never appears in a run, the job still reports `completed`, and the only symptom is a figure on
 * a screen that quietly stops moving. That is the exact failure gap G-2 recorded for the
 * listings half in 2026-08-26, so the two properties that prevent it — never-looked first, and
 * no product can starve — are asserted directly rather than inferred from the weights.
 */
import type { trackedProductsRepo } from '@buybox/db';
import { describe, expect, it } from 'vitest';
import {
  byRotationPriority,
  ROTATION_BASE_INTERVAL_MS,
  ROTATION_WEIGHTS,
  rotationIntervalMs,
} from './tracked-rotation.js';

const NOW = Date.UTC(2026, 8, 3, 12);
const HOUR = 60 * 60_000;

function product(
  id: string,
  over: Partial<trackedProductsRepo.TrackedProductRow> = {},
): trackedProductsRepo.TrackedProductRow {
  return {
    id,
    marketplaceCode: 'trendyol',
    productRef: id,
    productUrl: `/p-${id}`,
    label: id,
    isActive: true,
    addedAt: NOW - 100 * HOUR,
    lastScrapedAt: NOW - HOUR,
    ...over,
  };
}

describe('rotationIntervalMs', () => {
  it('waits one cycle for an ordinary product', () => {
    expect(rotationIntervalMs(product('a'))).toBe(ROTATION_BASE_INTERVAL_MS);
  });

  it('waits longer for a product nobody is selling', () => {
    expect(rotationIntervalMs(product('a', { hasSellers: false }))).toBe(
      ROTATION_BASE_INTERVAL_MS * ROTATION_WEIGHTS.noSellers,
    );
  });

  /**
   * `0` is the marketplace saying nobody has ever rated it; `null` is our own failure to read
   * the figure. Only the first is evidence about the product, and only it earns a penalty —
   * the same distinction the dead-product suggestion is careful about.
   */
  it('penalises a genuinely unrated product but not one whose rating we could not read', () => {
    expect(rotationIntervalMs(product('a', { ratingCount: 0 }))).toBe(
      ROTATION_BASE_INTERVAL_MS * ROTATION_WEIGHTS.neverRated,
    );
    expect(rotationIntervalMs(product('a', { ratingCount: null }))).toBe(ROTATION_BASE_INTERVAL_MS);
  });

  it('comes back sooner for a product the brand published a price for', () => {
    expect(rotationIntervalMs(product('a', { referencePrice: 100_00n }))).toBe(
      ROTATION_BASE_INTERVAL_MS * ROTATION_WEIGHTS.hasReferencePrice,
    );
  });

  it('multiplies independent reasons rather than taking the strongest', () => {
    expect(rotationIntervalMs(product('a', { hasSellers: false, ratingCount: 0 }))).toBe(
      ROTATION_BASE_INTERVAL_MS * ROTATION_WEIGHTS.noSellers * ROTATION_WEIGHTS.neverRated,
    );
  });
});

describe('byRotationPriority', () => {
  it('puts a product nobody has looked at first, whatever its weights say', () => {
    const order = byRotationPriority(
      [
        product('overdue', { lastScrapedAt: NOW - 500 * HOUR, referencePrice: 100_00n }),
        product('never', { lastScrapedAt: null, hasSellers: false, ratingCount: 0 }),
      ],
      NOW,
    );
    expect(order.map((p) => p.id)).toEqual(['never', 'overdue']);
  });

  it('prefers the product whose own interval has passed more times', () => {
    const order = byRotationPriority(
      [
        // Two cycles late against its 6× interval — barely due.
        product('dead', { lastScrapedAt: NOW - 8 * HOUR, hasSellers: false }),
        // Two cycles late against its 1× interval — twice overdue.
        product('live', { lastScrapedAt: NOW - 2 * HOUR }),
      ],
      NOW,
    );
    expect(order.map((p) => p.id)).toEqual(['live', 'dead']);
  });

  /**
   * The property that makes the weights safe. A deprioritised product's position rises without
   * limit as it waits, so it eventually overtakes a favoured one — a fixed weight would let a
   * large enough favoured set hold the head of the queue for ever, and nothing would say so.
   */
  it('lets a deprioritised product overtake a favoured one once it has waited long enough', () => {
    const dead = product('dead', { lastScrapedAt: NOW - 100 * HOUR, hasSellers: false, ratingCount: 0 });
    const favoured = product('favoured', { lastScrapedAt: NOW - HOUR, referencePrice: 100_00n });

    expect(byRotationPriority([favoured, dead], NOW).map((p) => p.id)).toEqual(['dead', 'favoured']);
  });

  it('breaks ties on the id, so two runs over unchanged data pick the same rows', () => {
    const rows = [product('b'), product('a'), product('c')];
    expect(byRotationPriority(rows, NOW).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(byRotationPriority(rows, NOW).map((p) => p.id)).toEqual(
      byRotationPriority([...rows].reverse(), NOW).map((p) => p.id),
    );
  });

  it('does not mutate the list it was given', () => {
    const rows = [product('b'), product('a')];
    byRotationPriority(rows, NOW);
    expect(rows.map((p) => p.id)).toEqual(['b', 'a']);
  });
});
