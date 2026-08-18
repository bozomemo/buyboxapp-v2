/**
 * The shared contract every `IMarketplaceAdapter` must pass (docs/12-build-plan.md 4.1,
 * docs/10-target-architecture.md §3, §10). Every real adapter's test file runs this against a
 * fixture-backed instance; `marketplace-contract.test.ts` proves it actually catches violations
 * by running it against a deliberately non-compliant stub.
 *
 * Assertions throw on the first violation rather than using a test framework's `expect`, so this
 * module has no test-runner dependency and can be called from any adapter's test file.
 */
import type { Money } from '@buybox/shared';
import type {
  BuyboxObservation,
  Credentials,
  IMarketplaceAdapter,
  ListingSnapshot,
  PriceChange,
} from '../ports/marketplace.js';

/** doc 10 §3 — the literal sentinel values the legacy app leaked; must never reappear. */
const SENTINEL_STRINGS = new Set(['< ? >', 'Error', 'No Seller', '-1']);

export interface MarketplaceContractFixture {
  readonly credentials: Credentials;
  /** IDs the fixture-backed adapter recognises for `fetchBuyboxObservations`. */
  readonly knownListingIds: readonly string[];
  readonly priceChanges: readonly PriceChange[];
}

function assertNoSentinelString(value: string | null, path: string): void {
  // `null` is the port's honest "this marketplace does not report it" and is always allowed;
  // the check exists to catch a *value* standing in for missing data, which is the opposite.
  if (value !== null && SENTINEL_STRINGS.has(value)) {
    throw new Error(`contract violation: sentinel value ${JSON.stringify(value)} escaped at ${path}`);
  }
}

function assertMoneyOrNull(value: Money | null, path: string): void {
  if (value === null) return;
  if (typeof value !== 'object' || typeof value.toKurus !== 'function') {
    throw new Error(`contract violation: ${path} is not a Money instance`);
  }
}

function assertValidListingSnapshot(listing: ListingSnapshot): void {
  assertNoSentinelString(listing.marketplaceListingId, 'listing.marketplaceListingId');
  assertNoSentinelString(listing.sellerStockCode, 'listing.sellerStockCode');
  assertNoSentinelString(listing.productName, 'listing.productName');
  assertMoneyOrNull(listing.price, 'listing.price');
  assertMoneyOrNull(listing.listPrice, 'listing.listPrice');
  assertMoneyOrNull(listing.customerPrice, 'listing.customerPrice');
  if (listing.offeredStock === -1) {
    throw new Error('contract violation: listing.offeredStock is the sentinel -1, must be a real count or 0');
  }
  for (const [i, reason] of listing.lockReasons.entries()) {
    assertNoSentinelString(reason, `listing.lockReasons[${i}]`);
  }
  for (const [i, reason] of listing.deactivationReasons.entries()) {
    assertNoSentinelString(reason, `listing.deactivationReasons[${i}]`);
  }
}

function assertValidBuyboxObservation(observation: BuyboxObservation): void {
  if (observation.rank === -1) {
    throw new Error('contract violation: observation.rank is the sentinel -1, must be null when unknown');
  }
  assertMoneyOrNull(observation.buyboxPrice, 'observation.buyboxPrice');
  assertMoneyOrNull(observation.secondPrice, 'observation.secondPrice');
  assertMoneyOrNull(observation.thirdPrice, 'observation.thirdPrice');
  if (!(observation.observedAt instanceof Date) || Number.isNaN(observation.observedAt.getTime())) {
    throw new Error('contract violation: observation.observedAt is not a valid Date');
  }
}

function assertValidCapabilities(adapter: IMarketplaceAdapter): void {
  const caps = adapter.capabilities;
  if (!caps || caps.maxBatchSize <= 0) {
    throw new Error('contract violation: capabilities.maxBatchSize must be a positive number');
  }
  if (caps.competitorPriceDepth < 0) {
    throw new Error('contract violation: capabilities.competitorPriceDepth must be >= 0');
  }
  if (typeof caps.dailyUpdateAllowance !== 'function') {
    throw new Error('contract violation: capabilities.dailyUpdateAllowance must be a function');
  }
  const allowance = caps.dailyUpdateAllowance(100);
  if (!Number.isFinite(allowance) || allowance < 0) {
    throw new Error(
      'contract violation: capabilities.dailyUpdateAllowance(100) must return a finite, non-negative number',
    );
  }
}

async function assertValidConnectionTest(adapter: IMarketplaceAdapter, fixture: MarketplaceContractFixture) {
  const result = await adapter.testConnection(fixture.credentials);
  if (typeof result.ok !== 'boolean') {
    throw new Error('contract violation: testConnection() result must have a boolean `ok`');
  }
  if (result.ok && typeof result.detail !== 'string') {
    throw new Error('contract violation: a successful testConnection() result must include `detail`');
  }
  if (!result.ok && typeof result.error !== 'string') {
    throw new Error('contract violation: a failed testConnection() result must include `error`');
  }
}

async function assertValidFetchListings(adapter: IMarketplaceAdapter): Promise<ListingSnapshot[]> {
  const listings: ListingSnapshot[] = [];
  for await (const listing of adapter.fetchListings()) {
    assertValidListingSnapshot(listing);
    listings.push(listing);
  }
  return listings;
}

async function assertValidFetchBuyboxObservations(
  adapter: IMarketplaceAdapter,
  fixture: MarketplaceContractFixture,
): Promise<void> {
  if (fixture.knownListingIds.length === 0) return;
  const observations = await adapter.fetchBuyboxObservations(fixture.knownListingIds);
  if (!Array.isArray(observations)) {
    throw new Error('contract violation: fetchBuyboxObservations must return an array');
  }
  for (const observation of observations) {
    assertValidBuyboxObservation(observation);
  }
}

async function assertValidSubmissionRoundTrip(
  adapter: IMarketplaceAdapter,
  fixture: MarketplaceContractFixture,
): Promise<void> {
  if (fixture.priceChanges.length === 0) return;
  const handle = await adapter.submitPriceChanges(fixture.priceChanges);
  if (!handle.batchId || !(handle.submittedAt instanceof Date)) {
    throw new Error('contract violation: submitPriceChanges() must return a batchId and submittedAt Date');
  }
  const result = await adapter.pollSubmission(handle);
  if (result.status !== 'pending' && result.status !== 'completed') {
    throw new Error('contract violation: pollSubmission() status must be "pending" or "completed"');
  }
  if (result.status === 'completed') {
    for (const item of result.items) {
      assertNoSentinelString(item.marketplaceListingId, 'submission item.marketplaceListingId');
      if (item.status !== 'success' && item.status !== 'failed') {
        throw new Error('contract violation: submission item status must be "success" or "failed"');
      }
    }
  }
}

/** Runs every contract check. Throws (does not return a report) on the first violation. */
/**
 * Every adapter must be able to say which seller it *is*. Downstream, this is the only thing
 * separating our own offer from a competitor's, and it fails silently when absent — the filters
 * match nothing, no error is raised, and we become our own biggest competitor in every report.
 * A missing merchant ref is therefore a contract violation, not a tolerated gap.
 */
function assertKnowsOwnMerchantRef(adapter: IMarketplaceAdapter): void {
  if (typeof adapter.merchantRef !== 'string' || adapter.merchantRef.trim() === '') {
    throw new Error('contract violation: adapter.merchantRef must be a non-empty string');
  }
  assertNoSentinelString(adapter.merchantRef, 'adapter.merchantRef');
}

export async function runMarketplaceContractChecks(
  adapter: IMarketplaceAdapter,
  fixture: MarketplaceContractFixture,
): Promise<void> {
  assertValidCapabilities(adapter);
  assertKnowsOwnMerchantRef(adapter);
  await assertValidConnectionTest(adapter, fixture);
  await assertValidFetchListings(adapter);
  await assertValidFetchBuyboxObservations(adapter, fixture);
  await assertValidSubmissionRoundTrip(adapter, fixture);
}
