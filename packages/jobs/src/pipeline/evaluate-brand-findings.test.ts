/**
 * `EvaluateBrandFindings` (2026-09-03) — the push half of the brand audit.
 *
 * The behaviour worth pinning down is not "it finds things" — `deriveAuditFindings` is table-
 * tested for that in `packages/core`, and `collectBrandFindings` is the same code the screen
 * runs. It is the **bookkeeping around the notification**, where every failure is silent:
 *
 * - a finding announced twice trains the operator to ignore the channel;
 * - a finding never announced is indistinguishable from no finding;
 * - a failed send that is recorded as delivered loses the finding permanently;
 * - and a webhook being down must not make the evaluation itself look broken.
 */
import {
  brandFindingsRepo,
  eventsRepo,
  jobsRepo,
  newId,
  trackedProductsRepo,
  watchedBrandsRepo,
} from '@buybox/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAdapterRegistry } from '../adapter-registry.js';
import { FakeClock } from '../clock.js';
import type { JobContext } from '../job.js';
import { createSqliteTestDb, NOW, seedMarketplace, type TestDb } from '../test-helpers.js';
import { EVALUATE_BRAND_FINDINGS_JOB, evaluateBrandFindings } from './evaluate-brand-findings.js';
import type { FindingNotification, IFindingNotifier } from './findings-notifier.js';

const DAY = 24 * 60 * 60 * 1000;

/** A notifier that records what it was asked to send, and can be told to fail. */
function fakeNotifier(behaviour: { fail?: boolean } = {}): IFindingNotifier & {
  readonly sent: FindingNotification[];
} {
  const sent: FindingNotification[] = [];
  return {
    sent,
    async send(message) {
      if (behaviour.fail) throw new Error('webhook down');
      sent.push(message);
    },
  };
}

describe('EvaluateBrandFindings', () => {
  let db: TestDb;
  let clock: FakeClock;
  let brandId: string;

  async function seedBrand(): Promise<string> {
    const groupId = newId();
    await watchedBrandsRepo.createWatchedBrandGroup(db.appDb, {
      id: groupId,
      name: 'Mars',
      note: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const id = newId();
    await watchedBrandsRepo.createWatchedBrand(db.appDb, {
      id,
      groupId,
      marketplaceCode: 'trendyol',
      label: 'Whiskas',
      brandRef: '104703',
      searchTerm: 'whiskas',
      isActive: true,
      lastSweptAt: null,
      lastSweepProductCount: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return id;
  }

  /**
   * A product with a published price, and one seller sitting well under it.
   *
   * The reference-price signal is used throughout because it is the cheapest finding to provoke
   * that is also `stated`: one product, one look, one price list row — no window of observations
   * needed to make a mean meaningful.
   */
  async function seedViolation(productRef: string, sellerRef: string, priceKurus: bigint): Promise<void> {
    const productId = newId();
    await trackedProductsRepo.addTrackedProduct(db.appDb, {
      id: productId,
      marketplaceCode: 'trendyol',
      productRef,
      productUrl: `/p-${productRef}`,
      label: `Ürün ${productRef}`,
      isActive: true,
      addedAt: NOW - 10 * DAY,
      watchedBrandId: brandId,
    });
    await trackedProductsRepo.applyReferencePrices(
      db.appDb,
      [{ barcode: null, marketplaceCode: 'trendyol', productRef, referencePrice: 100_00n }],
      'liste.csv',
      NOW - 10 * DAY,
    );
    await trackedProductsRepo.insertTrackedProductObservations(db.appDb, [
      {
        id: newId(),
        trackedProductId: productId,
        observedAt: NOW - DAY,
        status: 'ok',
        rank: 1,
        sellerName: `Satıcı ${sellerRef}`,
        sellerRef,
        price: priceKurus,
        finalPrice: priceKurus,
        offeredStock: 5,
      },
    ]);
  }

  function ctx(payload: Record<string, unknown> = {}): JobContext {
    return {
      appDb: db.appDb,
      clock,
      adapters: buildAdapterRegistry([]),
      correlationId: 'test-run',
      payload: JSON.stringify(payload),
      reportProgress: () => {},
    };
  }

  beforeEach(async () => {
    db = await createSqliteTestDb();
    clock = new FakeClock(NOW);
    await seedMarketplace(db.appDb, 'trendyol');
    await jobsRepo.startJobRun(db.appDb, {
      id: 'test-run',
      jobName: EVALUATE_BRAND_FINDINGS_JOB,
      startedAt: NOW,
      finishedAt: null,
      state: 'running',
      itemsTotal: 0,
      itemsOk: 0,
      itemsFailed: 0,
      error: null,
      correlationId: 'test-run',
      jobQueueId: null,
    });
    brandId = await seedBrand();
  });
  afterEach(() => db.cleanup());

  it('opens a finding and tells the notifier about it once', async () => {
    await seedViolation('1', 'cutter', 70_00n);
    const notifier = fakeNotifier();

    const result = await evaluateBrandFindings(ctx(), { notifier });

    expect(result.itemsOk).toBe(1);
    const open = await brandFindingsRepo.openFindings(db.appDb, brandId);
    expect(open.map((f) => f.kind)).toEqual(['belowReferencePrice']);
    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]!.brandLabel).toBe('Whiskas');
  });

  /**
   * The failure that would make the channel useless within a day: the condition is still true on
   * every run, and a job with no memory would announce it every six hours for ever.
   */
  it('does not announce the same finding twice', async () => {
    await seedViolation('1', 'cutter', 70_00n);
    const notifier = fakeNotifier();

    await evaluateBrandFindings(ctx(), { notifier });
    clock.advance(6 * 60 * 60_000);
    const second = await evaluateBrandFindings(ctx(), { notifier });

    expect(notifier.sent).toHaveLength(1);
    expect(second.itemsOk).toBe(1);
    // Still open — unchanged, not resolved and not reopened.
    expect(await brandFindingsRepo.openFindings(db.appDb, brandId)).toHaveLength(1);
  });

  it('announces a genuinely new finding on a later run', async () => {
    await seedViolation('1', 'cutter', 70_00n);
    const notifier = fakeNotifier();
    await evaluateBrandFindings(ctx(), { notifier });

    await seedViolation('2', 'other-cutter', 60_00n);
    clock.advance(6 * 60 * 60_000);
    await evaluateBrandFindings(ctx(), { notifier });

    expect(notifier.sent).toHaveLength(2);
    expect(notifier.sent[1]!.findings).toHaveLength(1);
    expect(await brandFindingsRepo.openFindings(db.appDb, brandId)).toHaveLength(2);
  });

  /**
   * `notified_at` is a separate column precisely so this case is recoverable. Recording the send
   * optimistically would lose the finding for ever the first time a webhook was down.
   */
  it('leaves a finding unnotified when the send fails, and retries it next run', async () => {
    await seedViolation('1', 'cutter', 70_00n);
    const failing = fakeNotifier({ fail: true });

    await evaluateBrandFindings(ctx(), { notifier: failing });

    const [row] = await brandFindingsRepo.openFindings(db.appDb, brandId);
    expect(row!.notifiedAt).toBeNull();
    expect(await brandFindingsRepo.unnotifiedFindings(db.appDb, 10)).toHaveLength(1);
  });

  it('does not fail the run when the notifier does, and says so on the event log', async () => {
    await seedViolation('1', 'cutter', 70_00n);

    const result = await evaluateBrandFindings(ctx(), { notifier: fakeNotifier({ fail: true }) });

    // The evaluation worked and its findings are stored — a webhook being down is not that.
    expect(result.itemsFailed).toBe(0);
    expect(result.itemsOk).toBe(1);
    const events = await eventsRepo.listRecentEvents(db.appDb, 50);
    expect(events.some((e) => e.code === 'BrandFindingsNotificationFailed')).toBe(true);
  });

  it('stores findings with no notifier configured at all', async () => {
    await seedViolation('1', 'cutter', 70_00n);

    // No notifier: the normal state of an install that has configured no webhook. It loses a
    // notification, never a finding.
    const result = await evaluateBrandFindings(ctx(), { notifier: undefined });

    expect(result.itemsOk).toBe(1);
    expect(await brandFindingsRepo.openFindings(db.appDb, brandId)).toHaveLength(1);
  });

  it('resolves a finding the archive no longer produces, silently', async () => {
    await seedViolation('1', 'cutter', 70_00n);
    const notifier = fakeNotifier();
    await evaluateBrandFindings(ctx(), { notifier });

    // The list price is withdrawn — the finding cannot be derived any more.
    const [product] = (await trackedProductsRepo.listTrackedProducts(db.appDb, {})).filter(
      (p) => p.productRef === '1',
    );
    await trackedProductsRepo.clearReferencePrices(db.appDb, [product!.id]);
    clock.advance(6 * 60 * 60_000);
    await evaluateBrandFindings(ctx(), { notifier });

    expect(await brandFindingsRepo.openFindings(db.appDb, brandId)).toHaveLength(0);
    // Resolutions are never announced: a finding also disappears when a threshold moves, and
    // this cannot tell the two apart.
    expect(notifier.sent).toHaveLength(1);
  });

  it('evaluates only the named brand when the payload names one', async () => {
    await seedViolation('1', 'cutter', 70_00n);
    const notifier = fakeNotifier();

    const result = await evaluateBrandFindings(ctx({ watchedBrandId: 'no-such-brand' }), { notifier });

    expect(result.itemsTotal).toBe(0);
    expect(notifier.sent).toHaveLength(0);
  });

  /**
   * A competitor's brand is watched for price comparison, not for audit. Every `stated` signal
   * is a statement about *our* distribution agreements — nobody is unauthorised **by us** to
   * sell somebody else's brand — so evaluating a rival would open findings that are wrong in
   * kind rather than in degree, which is the fastest way to make an audit list unreadable.
   */
  it('never evaluates a competitor brand', async () => {
    await watchedBrandsRepo.updateWatchedBrand(db.appDb, brandId, {
      label: 'Whiskas',
      brandRef: '104703',
      searchTerm: 'whiskas',
      isActive: true,
      isOwnBrand: false,
      updatedAt: NOW,
    });
    await seedViolation('1', 'cutter', 70_00n);
    const notifier = fakeNotifier();

    const result = await evaluateBrandFindings(ctx(), { notifier });

    expect(result.itemsTotal).toBe(0);
    expect(await brandFindingsRepo.openFindings(db.appDb, brandId)).toHaveLength(0);
    expect(notifier.sent).toHaveLength(0);
  });

  it('records nothing and reports a clean run for a brand with no findings', async () => {
    const notifier = fakeNotifier();

    const result = await evaluateBrandFindings(ctx(), { notifier });

    expect(result).toEqual({ itemsTotal: 1, itemsOk: 1, itemsFailed: 0 });
    expect(await brandFindingsRepo.openFindings(db.appDb, brandId)).toHaveLength(0);
    expect(notifier.sent).toHaveLength(0);
  });

  /**
   * The reference-price finding carries two `bigint` money fields, and `JSON.stringify` throws
   * on a `bigint` rather than dropping it — so an unserialised payload would fail the whole
   * evaluation rather than storing a slightly poorer row.
   */
  it('stores a payload containing money without throwing', async () => {
    await seedViolation('1', 'cutter', 70_00n);

    await evaluateBrandFindings(ctx(), { notifier: fakeNotifier() });

    const [row] = await brandFindingsRepo.openFindings(db.appDb, brandId);
    const payload = JSON.parse(row!.payload) as { referencePrice: string; lowestPrice: string };
    expect(payload.referencePrice).toBe('10000');
    expect(payload.lowestPrice).toBe('7000');
  });
});
