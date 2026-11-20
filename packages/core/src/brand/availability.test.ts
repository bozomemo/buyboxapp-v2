/**
 * Table-driven, like every decision branch in this package.
 */
import { describe, expect, it } from 'vitest';
import { classifyAvailability, LOW_STOCK_THRESHOLD, type AvailabilityInput } from './availability.js';

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    hasSellers: true,
    offers: [{ rank: 1, verdict: 'authorised', offeredStock: 50 }],
    policyInForce: true,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    ...overrides,
  };
}

describe('classifyAvailability (brand roadmap §6.8)', () => {
  it.each([
    { name: 'healthy: an authorised buybox with stock', input: input(), expected: [] },
    // "We have never read it" is not "nobody sells it".
    { name: 'never successfully read: nothing to say', input: input({ hasSellers: null, offers: [] }), expected: [] },
    { name: 'the last good look found nobody selling', input: input({ hasSellers: false, offers: [] }), expected: ['noSellers'] },
    {
      name: 'sellers, none authorised (blocked or undecided)',
      input: input({
        offers: [
          { rank: 1, verdict: 'blocked', offeredStock: 50 },
          { rank: 2, verdict: 'undefined', offeredStock: 50 },
        ],
      }),
      expected: ['onlyUnauthorised'],
    },
    {
      name: 'one authorised seller further down is enough',
      input: input({
        offers: [
          { rank: 1, verdict: 'undefined', offeredStock: 50 },
          { rank: 2, verdict: 'authorised', offeredStock: 50 },
        ],
      }),
      expected: [],
    },
    {
      // Without a single "authorised" rule there is no list to be off; every seller would read
      // as unauthorised and the alert would mean nothing.
      name: 'no authorised rule in force: never "only unauthorised"',
      input: input({ policyInForce: false, offers: [{ rank: 1, verdict: 'undefined', offeredStock: 50 }] }),
      expected: [],
    },
    {
      name: 'buybox stock under the threshold',
      input: input({ offers: [{ rank: 1, verdict: 'authorised', offeredStock: 2 }] }),
      expected: ['lowStock'],
    },
    {
      name: 'stock exactly at the threshold is not low',
      input: input({ offers: [{ rank: 1, verdict: 'authorised', offeredStock: 3 }] }),
      expected: [],
    },
    {
      name: 'stock unknown: not low',
      input: input({ offers: [{ rank: 1, verdict: 'authorised', offeredStock: null }] }),
      expected: [],
    },
    {
      name: 'only the buybox holder’s stock counts',
      input: input({
        offers: [
          { rank: 1, verdict: 'authorised', offeredStock: 40 },
          { rank: 2, verdict: 'authorised', offeredStock: 1 },
        ],
      }),
      expected: [],
    },
    {
      name: 'both at once',
      input: input({ offers: [{ rank: 1, verdict: 'blocked', offeredStock: 1 }] }),
      expected: ['onlyUnauthorised', 'lowStock'],
    },
    {
      // hasSellers true but the offer rows are gone (pruned): say nothing rather than guess.
      name: 'sellers reported but no offer rows to read',
      input: input({ offers: [] }),
      expected: [],
    },
  ])('$name', ({ input: given, expected }) => {
    expect(classifyAvailability(given)).toEqual(expected);
  });
});
