/**
 * `ResolveSellerIdentity` — resolves the firm behind **one** storefront, on demand
 * (doc 06 §12.4 Faz 7, guide §29, api-references §1.6).
 *
 * ```
 * find the seller row
 * take the products it was recently seen on, freshest first
 * for each, until one answers about the right firm:
 *     request that product page as this merchant
 * store the identity; copy the tax number to the seller row only if that column is empty
 * ```
 *
 * ## Why this is not in `JOB_CATALOG`
 *
 * Every other job answers a question about the whole system and can be triggered with an empty
 * payload — "import the listings", "sweep the brands". This one names a single firm, and a
 * "run now" with no seller would have nothing to do. It is enqueued from the button on the
 * seller's own row and nowhere else, which is also what keeps it one at a time: the number of
 * sellers worth resolving is the number a person intends to write to.
 *
 * ## Why several candidate products
 *
 * A seller can be gone from a product between the last look and the resolution. The
 * merchant-scoped page then comes back describing whoever holds the buybox instead — which
 * parses perfectly and is about the wrong company. That is `identityMismatch`, and it is the one
 * failure that must never be stored: a tax number attributed to the wrong storefront is a record
 * an operator may act on legally. So the job walks the candidates until one page is about the
 * firm it asked for, and stores nothing if none is.
 *
 * ⚠️ **Reporting only.** Nothing here writes an observation row, and nothing it produces reaches
 * a pricing decision. `Reprice` and `ObserveBuybox` read `listings`; this touches
 * `competitor_seller_identities` and, at most, one operator-owned column that no engine reads.
 */
import { SellerIdentityError, type ISellerIdentitySource, type SellerIdentitySnapshot } from '@buybox/adapters';
import type { MarketplaceCode } from '@buybox/core';
import {
  brandReportsRepo,
  competitorSellersRepo,
  eventsRepo,
  newId,
  sellerIdentitiesRepo,
} from '@buybox/db';
import { z } from 'zod';
import type { JobContext, JobResult } from '../job.js';
import { getSellerIdentitySource } from '../seller-identity-source-registry.js';

export const RESOLVE_SELLER_IDENTITY_JOB = 'ResolveSellerIdentity';

/**
 * How far back to look for a product the seller was on. Wide, because being on a page a month
 * ago is still the best lead available, and a candidate that has gone stale costs one
 * `identityMismatch` and moves to the next.
 */
export const IDENTITY_LOOKBACK_DAYS = 60;

/**
 * How many products to try before giving up.
 *
 * Four, not forty. Each attempt is a real page load against a marketplace, and a seller who has
 * vanished from four of their most recent products is a seller whose identity this route cannot
 * establish today — trying the whole catalogue would turn one button press into a crawl, which
 * is the exact failure api-references §1.6 exists to prevent.
 */
export const IDENTITY_MAX_CANDIDATES = 4;

export const ResolveSellerIdentityPayloadSchema = z.object({
  marketplaceCode: z.enum(['trendyol', 'hepsiburada']),
  /** The marketplace merchant id, as carried on the observation rows. */
  sellerRef: z.string().min(1),
  lookbackDays: z.number().int().min(1).default(IDENTITY_LOOKBACK_DAYS),
  maxCandidates: z.number().int().min(1).default(IDENTITY_MAX_CANDIDATES),
});

export type ResolveSellerIdentityPayload = z.infer<typeof ResolveSellerIdentityPayloadSchema>;

/** Never escalates — see `sweep-brand-catalogue.ts`'s `noteSweepEvent` for the same rule. */
async function noteEvent(
  ctx: JobContext,
  marketplaceCode: MarketplaceCode,
  level: 'info' | 'warn',
  code: string,
  message: string,
): Promise<void> {
  try {
    await eventsRepo.logEvent(ctx.appDb, {
      id: newId(),
      at: ctx.clock.nowMs(),
      level,
      marketplaceCode,
      listingId: null,
      jobRunId: ctx.correlationId,
      code,
      message,
      context: null,
    });
  } catch {
    // Deliberately silent: an unwritable event must not lose a completed resolution.
  }
}

interface Attempt {
  readonly snapshot: SellerIdentitySnapshot | null;
  readonly lastError: string | null;
  readonly attempts: number;
}

/**
 * Tries each candidate page in turn. Every failure kind moves to the next candidate, including a
 * fetch failure — one product page being unreachable says nothing about the next, and the caller
 * only ever sees whether *some* page answered.
 */
export async function resolveThroughCandidates(
  source: ISellerIdentitySource,
  sellerRef: string,
  candidates: readonly { productRef: string; productUrl: string }[],
  onAttempt?: (index: number, productRef: string) => void,
): Promise<Attempt> {
  let lastError: string | null = null;
  let attempts = 0;

  for (const [index, candidate] of candidates.entries()) {
    attempts += 1;
    onAttempt?.(index, candidate.productRef);
    try {
      const snapshot = await source.resolveSellerIdentity(
        { url: candidate.productUrl, contentId: candidate.productRef },
        sellerRef,
      );
      return { snapshot, lastError: null, attempts };
    } catch (error) {
      lastError =
        error instanceof SellerIdentityError
          ? `${error.kind}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
    }
  }
  return { snapshot: null, lastError, attempts };
}

export async function resolveSellerIdentity(ctx: JobContext): Promise<JobResult> {
  const payload = ResolveSellerIdentityPayloadSchema.parse(JSON.parse(ctx.payload));
  const marketplaceCode = payload.marketplaceCode as MarketplaceCode;

  const source = getSellerIdentitySource(ctx.sellerIdentitySources, marketplaceCode);
  if (!source) {
    // A marketplace with no identity source is a supported configuration, like a missing
    // competitor source: identities simply cannot be resolved there.
    return { itemsTotal: 0, itemsOk: 0, itemsFailed: 0 };
  }

  const seller = await competitorSellersRepo.getCompetitorSeller(
    ctx.appDb,
    marketplaceCode,
    payload.sellerRef,
  );
  if (!seller) {
    await noteEvent(
      ctx,
      marketplaceCode,
      'warn',
      'SellerIdentityNoSeller',
      `Satıcı ${payload.sellerRef} kayıtlı değil — kimlik çözümlenmedi`,
    );
    return { itemsTotal: 1, itemsOk: 0, itemsFailed: 1 };
  }

  const nowMs = ctx.clock.nowMs();
  const candidates = await brandReportsRepo.sellerProductTargets(
    ctx.appDb,
    { marketplaceCode, sellerRef: payload.sellerRef },
    { sinceMs: nowMs - payload.lookbackDays * 24 * 60 * 60_000, untilMs: nowMs },
    payload.maxCandidates,
  );
  if (candidates.length === 0) {
    await noteEvent(
      ctx,
      marketplaceCode,
      'warn',
      'SellerIdentityNoProduct',
      `${seller.sellerName} son ${payload.lookbackDays} günde hiçbir takip edilen üründe görülmedi — kimlik çözümlenemedi`,
    );
    return { itemsTotal: 1, itemsOk: 0, itemsFailed: 1 };
  }

  ctx.reportProgress({ done: 0, total: candidates.length, currentItem: seller.sellerName });
  const { snapshot, lastError, attempts } = await resolveThroughCandidates(
    source,
    payload.sellerRef,
    candidates,
    (index) => ctx.reportProgress({ done: index, total: candidates.length, currentItem: seller.sellerName }),
  );
  ctx.reportProgress({ done: attempts, total: candidates.length, currentItem: null });

  if (!snapshot) {
    await noteEvent(
      ctx,
      marketplaceCode,
      'warn',
      'SellerIdentityUnresolved',
      `${seller.sellerName} kimliği ${attempts} üründe denendi, çözümlenemedi: ${lastError ?? 'bilinmeyen sebep'}`,
    );
    return { itemsTotal: 1, itemsOk: 0, itemsFailed: 1 };
  }

  const { identity, diagnostics } = snapshot;
  await sellerIdentitiesRepo.upsertSellerIdentity(ctx.appDb, {
    id: newId(),
    competitorSellerId: seller.id,
    officialName: identity.officialName,
    taxNumber: identity.taxNumber,
    taxOffice: identity.taxOffice,
    registeredEmailAddress: identity.registeredEmailAddress,
    address: identity.address,
    cityName: identity.cityName,
    countryName: identity.countryName,
    listings: identity.listings,
    sourceUrl: snapshot.fetchedUrl,
    parserVersion: diagnostics.parserVersion,
    resolvedAt: snapshot.resolvedAt.getTime(),
  });

  // Only into an empty column. See `setSellerTaxNumberIfAbsent` for why a resolution may fill a
  // gap and never correct a person: that column decides who Faz 5's list counts as authorised.
  const wroteTaxNumber =
    identity.taxNumber !== null
      ? await sellerIdentitiesRepo.setSellerTaxNumberIfAbsent(ctx.appDb, seller.id, identity.taxNumber)
      : false;

  await noteEvent(
    ctx,
    marketplaceCode,
    'info',
    'SellerIdentityResolved',
    wroteTaxNumber
      ? `${seller.sellerName} kimliği çözümlendi; vergi numarası satıcı kaydına yazıldı`
      : `${seller.sellerName} kimliği çözümlendi`,
  );

  return { itemsTotal: 1, itemsOk: 1, itemsFailed: 0 };
}

export const RESOLVE_SELLER_IDENTITY_DEFINITION = {
  jobName: RESOLVE_SELLER_IDENTITY_JOB,
  handler: resolveSellerIdentity,
  /** On demand only — deliberately absent from `JOB_CATALOG`; see this file's header. */
  cadenceMs: undefined,
} as const;
