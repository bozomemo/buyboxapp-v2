/**
 * `ResolveSellerIdentity` (doc 06 §12.4 Faz 7, guide §29).
 *
 * Two groups carry the phase's definition of done. "candidate walking" pins that a page about
 * the wrong firm is never stored, and "what this job may and may not write" pins that a
 * resolution fills an empty tax number and never corrects one a person entered — the column
 * Faz 5's authorised-seller list matches on.
 */
import {
  SellerIdentityError,
  type ISellerIdentitySource,
  type ProductPageRef,
  type SellerIdentitySnapshot,
} from '@buybox/adapters';
import {
  competitorSellersRepo,
  eventsRepo,
  jobsRepo,
  newId,
  sellerIdentitiesRepo,
  trackedProductsRepo,
} from '@buybox/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { FakeClock } from '../clock.js';
import type { JobContext, JobProgress } from '../job.js';
import { buildSellerIdentitySourceRegistry } from '../seller-identity-source-registry.js';
import { createSqliteTestDb, NOW, seedMarketplace, type TestDb } from '../test-helpers.js';
import { RESOLVE_SELLER_IDENTITY_JOB, resolveSellerIdentity } from './resolve-seller-identity.js';

const SELLER_REF = '736424';
const DAY = 24 * 60 * 60 * 1000;

function snapshotFor(sellerRef: string, overrides: Record<string, unknown> = {}): SellerIdentitySnapshot {
  return {
    identity: {
      marketplaceCode: 'trendyol',
      sellerRef,
      sellerName: 'Cansu Beauty',
      officialName: 'Cansu Beauty Kozmetik A.Ş.',
      taxNumber: '1234567890',
      taxOffice: null,
      registeredEmailAddress: 'kep@example.invalid',
      address: null,
      cityName: null,
      countryName: null,
      listings: [{ listingRef: 'l1', itemRef: 'i1', barcode: '5025155088180', offeredStock: 4 }],
      ...(overrides.identity as object | undefined),
    },
    fetchedUrl: `https://www.trendyol.com/x-p-1?merchantId=${sellerRef}`,
    resolvedAt: new Date(NOW),
    diagnostics: {
      parserVersion: '1.0.0',
      stateFound: true,
      merchantFound: true,
      identityMatched: true,
      identityFieldsFound: 3,
      listingCount: 1,
    },
  };
}

/** A source driven by a per-call outcome list, so candidate walking is directly observable. */
function fakeSource(
  outcomes: readonly (SellerIdentitySnapshot | SellerIdentityError)[],
): ISellerIdentitySource & { readonly calls: { ref: ProductPageRef; sellerRef: string }[] } {
  const calls: { ref: ProductPageRef; sellerRef: string }[] = [];
  return {
    code: 'trendyol',
    calls,
    async resolveSellerIdentity(ref, sellerRef) {
      calls.push({ ref, sellerRef });
      const outcome = outcomes[calls.length - 1];
      if (outcome === undefined) throw new SellerIdentityError('no more outcomes', 'fetchFailed');
      if (outcome instanceof SellerIdentityError) throw outcome;
      return outcome;
    },
  };
}

describe('ResolveSellerIdentity', () => {
  let db: TestDb;
  let clock: FakeClock;

  async function seedSeller(ref = SELLER_REF): Promise<string> {
    const id = newId();
    await competitorSellersRepo.recordSeenSellers(db.appDb, [
      { id, marketplaceCode: 'trendyol', sellerRef: ref, sellerName: `Satıcı ${ref}`, seenAt: NOW },
    ]);
    const seller = await competitorSellersRepo.getCompetitorSeller(db.appDb, 'trendyol', ref);
    return seller!.id;
  }

  /** A tracked product with one look showing this seller on it. */
  async function seedSighting(productRef: string, sellerRef = SELLER_REF, atMs = NOW - DAY): Promise<string> {
    const id = newId();
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id,
      marketplaceCode: 'trendyol',
      productRef,
      productUrl: `/p-${productRef}`,
      label: `Ürün ${productRef}`,
      isActive: true,
      addedAt: NOW,
      watchedBrandId: null,
    });
    await trackedProductsRepo.insertTrackedProductObservations(db.appDb, [
      {
        id: newId(),
        trackedProductId: id,
        observedAt: atMs,
        status: 'ok',
        rank: 1,
        sellerName: `Satıcı ${sellerRef}`,
        sellerRef,
        price: 10_000n,
        finalPrice: 10_000n,
        offeredStock: 5,
      },
    ]);
    return id;
  }

  function ctxFor(
    source: ISellerIdentitySource | undefined,
    payload: Record<string, unknown>,
  ): JobContext & { readonly progress: JobProgress[] } {
    const progress: JobProgress[] = [];
    return {
      appDb: db.appDb,
      clock,
      adapters: buildAdapterRegistry([]),
      sellerIdentitySources:
        source === undefined ? undefined : buildSellerIdentitySourceRegistry([['trendyol', source]]),
      correlationId: 'test-run',
      payload: JSON.stringify({ marketplaceCode: 'trendyol', ...payload }),
      reportProgress: (p) => progress.push(p),
      progress,
    };
  }

  async function eventCodes(): Promise<string[]> {
    const events = await eventsRepo.listRecentEvents(db.appDb, 50);
    return events.map((e) => e.code);
  }

  beforeEach(async () => {
    db = await createSqliteTestDb();
    clock = new FakeClock(NOW);
    await seedMarketplace(db.appDb, 'trendyol');
    // `app_events.job_run_id` is a foreign key; the runner supplies a real run row in production.
    await jobsRepo.startJobRun(db.appDb, {
      id: 'test-run',
      jobName: RESOLVE_SELLER_IDENTITY_JOB,
      startedAt: NOW,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: 'test-run',
      currentItem: null,
      progressDone: null,
      progressTotal: null,
    });
  });

  describe('the resolution', () => {
    it('stores the firm behind the storefront', async () => {
      const sellerId = await seedSeller();
      await seedSighting('2250165');
      const source = fakeSource([snapshotFor(SELLER_REF)]);

      const result = await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));

      expect(result).toMatchObject({ itemsTotal: 1, itemsOk: 1, itemsFailed: 0 });
      const stored = await sellerIdentitiesRepo.getSellerIdentity(db.appDb, sellerId);
      expect(stored?.officialName).toBe('Cansu Beauty Kozmetik A.Ş.');
      expect(stored?.registeredEmailAddress).toBe('kep@example.invalid');
      expect(stored?.listings[0]?.barcode).toBe('5025155088180');
    });

    it('asks through a product the seller was actually seen on', async () => {
      await seedSeller();
      await seedSighting('2250165');
      const source = fakeSource([snapshotFor(SELLER_REF)]);

      await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));

      expect(source.calls).toHaveLength(1);
      expect(source.calls[0]!.ref.contentId).toBe('2250165');
      expect(source.calls[0]!.sellerRef).toBe(SELLER_REF);
    });

    it('tries the freshest sighting first', async () => {
      await seedSeller();
      await seedSighting('older', SELLER_REF, NOW - 10 * DAY);
      await seedSighting('newer', SELLER_REF, NOW - DAY);
      const source = fakeSource([snapshotFor(SELLER_REF)]);

      await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));

      expect(source.calls[0]!.ref.contentId).toBe('newer');
    });
  });

  describe('candidate walking', () => {
    it('moves to the next product when the page came back about another firm', async () => {
      // The seller left that product between the last look and now, so the merchant-scoped page
      // describes whoever holds the buybox instead. It parses; it is about the wrong company.
      const sellerId = await seedSeller();
      await seedSighting('gone', SELLER_REF, NOW - DAY);
      await seedSighting('still-there', SELLER_REF, NOW - 2 * DAY);
      const source = fakeSource([
        new SellerIdentityError('different merchant', 'identityMismatch'),
        snapshotFor(SELLER_REF),
      ]);

      const result = await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));

      expect(result.itemsOk).toBe(1);
      expect(source.calls.map((c) => c.ref.contentId)).toEqual(['gone', 'still-there']);
      expect((await sellerIdentitiesRepo.getSellerIdentity(db.appDb, sellerId))?.taxNumber).toBe(
        '1234567890',
      );
    });

    it('stores nothing at all when every candidate was about somebody else', async () => {
      // The failure that must never be stored: a tax number on the wrong storefront is a record
      // an operator may act on legally.
      const sellerId = await seedSeller();
      await seedSighting('a');
      await seedSighting('b');
      const source = fakeSource([
        new SellerIdentityError('different merchant', 'identityMismatch'),
        new SellerIdentityError('different merchant', 'identityMismatch'),
      ]);

      const result = await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));

      expect(result).toMatchObject({ itemsOk: 0, itemsFailed: 1 });
      expect(await sellerIdentitiesRepo.getSellerIdentity(db.appDb, sellerId)).toBeUndefined();
      const seller = await competitorSellersRepo.getCompetitorSeller(db.appDb, 'trendyol', SELLER_REF);
      expect(seller?.taxNumber).toBeNull();
      expect(await eventCodes()).toContain('SellerIdentityUnresolved');
    });

    it('moves past an unreachable page too', async () => {
      await seedSeller();
      await seedSighting('a');
      await seedSighting('b');
      const source = fakeSource([
        new SellerIdentityError('503', 'fetchFailed'),
        snapshotFor(SELLER_REF),
      ]);

      const result = await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));
      expect(result.itemsOk).toBe(1);
    });

    it('never tries more products than the ceiling allows', async () => {
      // Each attempt is a real page load. A seller gone from their most recent products is one
      // this cannot identify today — walking the catalogue would turn a button into a crawl.
      await seedSeller();
      for (const ref of ['a', 'b', 'c', 'd', 'e', 'f']) await seedSighting(ref);
      const source = fakeSource(
        Array.from({ length: 6 }, () => new SellerIdentityError('nope', 'identityMismatch')),
      );

      await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF, maxCandidates: 2 }));

      expect(source.calls).toHaveLength(2);
    });

    it('says so, and asks for nothing, when the seller is on no tracked product', async () => {
      await seedSeller();
      const source = fakeSource([snapshotFor(SELLER_REF)]);

      const result = await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));

      expect(result).toMatchObject({ itemsOk: 0, itemsFailed: 1 });
      expect(source.calls).toHaveLength(0);
      expect(await eventCodes()).toContain('SellerIdentityNoProduct');
    });

    it('ignores a sighting older than the lookback window', async () => {
      await seedSeller();
      await seedSighting('ancient', SELLER_REF, NOW - 400 * DAY);
      const source = fakeSource([snapshotFor(SELLER_REF)]);

      const result = await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));
      expect(result.itemsFailed).toBe(1);
      expect(source.calls).toHaveLength(0);
    });
  });

  describe('what this job may and may not write', () => {
    it('fills an empty tax number on the seller row', async () => {
      const sellerId = await seedSeller();
      await seedSighting('2250165');

      await resolveSellerIdentity(ctxFor(fakeSource([snapshotFor(SELLER_REF)]), { sellerRef: SELLER_REF }));

      const seller = await competitorSellersRepo.getCompetitorSeller(db.appDb, 'trendyol', SELLER_REF);
      expect(seller?.taxNumber).toBe('1234567890');
      void sellerId;
    });

    it('leaves a tax number the operator entered exactly as it was', async () => {
      const sellerId = await seedSeller();
      await seedSighting('2250165');
      await sellerIdentitiesRepo.setSellerTaxNumberIfAbsent(db.appDb, sellerId, '9999999999');

      await resolveSellerIdentity(ctxFor(fakeSource([snapshotFor(SELLER_REF)]), { sellerRef: SELLER_REF }));

      const seller = await competitorSellersRepo.getCompetitorSeller(db.appDb, 'trendyol', SELLER_REF);
      expect(seller?.taxNumber).toBe('9999999999');
      // The resolution is still stored — the disagreement is visible, not resolved by the job.
      expect((await sellerIdentitiesRepo.getSellerIdentity(db.appDb, sellerId))?.taxNumber).toBe(
        '1234567890',
      );
    });

    it('stores an identity that carried no tax number without inventing one', async () => {
      const sellerId = await seedSeller();
      await seedSighting('2250165');
      const source = fakeSource([snapshotFor(SELLER_REF, { identity: { taxNumber: null } })]);

      await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));

      expect((await sellerIdentitiesRepo.getSellerIdentity(db.appDb, sellerId))?.taxNumber).toBeNull();
      const seller = await competitorSellersRepo.getCompetitorSeller(db.appDb, 'trendyol', SELLER_REF);
      expect(seller?.taxNumber).toBeNull();
    });

    it('writes no observation row — this is not a scrape', async () => {
      // The page it read is merchant-scoped: its ordering is a preview, not the buybox. An
      // observation written from it would put a false rank into the archive every report reads.
      await seedSeller();
      const productId = await seedSighting('2250165');
      const before = await trackedProductsRepo.trackedProductObservationsSince(db.appDb, productId, 0);

      await resolveSellerIdentity(ctxFor(fakeSource([snapshotFor(SELLER_REF)]), { sellerRef: SELLER_REF }));

      const after = await trackedProductsRepo.trackedProductObservationsSince(db.appDb, productId, 0);
      expect(after).toHaveLength(before.length);
    });

    it('does nothing but succeed when no identity source is configured', async () => {
      await seedSeller();
      await seedSighting('2250165');

      const result = await resolveSellerIdentity(ctxFor(undefined, { sellerRef: SELLER_REF }));

      expect(result).toEqual({ itemsTotal: 0, itemsOk: 0, itemsFailed: 0 });
    });

    it('reports a seller it has never seen rather than resolving a stranger', async () => {
      await seedSighting('2250165', 'someone-else');
      const source = fakeSource([snapshotFor(SELLER_REF)]);

      const result = await resolveSellerIdentity(ctxFor(source, { sellerRef: SELLER_REF }));

      expect(result).toMatchObject({ itemsOk: 0, itemsFailed: 1 });
      expect(source.calls).toHaveLength(0);
      expect(await eventCodes()).toContain('SellerIdentityNoSeller');
    });

    it('records the resolution as an event naming what it wrote', async () => {
      await seedSeller();
      await seedSighting('2250165');

      await resolveSellerIdentity(ctxFor(fakeSource([snapshotFor(SELLER_REF)]), { sellerRef: SELLER_REF }));

      const events = await eventsRepo.listRecentEvents(db.appDb, 50);
      const resolved = events.find((e) => e.code === 'SellerIdentityResolved');
      expect(resolved?.message).toContain('vergi numarası');
    });
  });
});
