/**
 * The **seller identity** port — resolving the firm behind one storefront, on demand
 * (doc 06 §12.4 Faz 7, api-references §1.6, guide §29).
 *
 * The fourth port, and separate from `ICompetitorSource` for a reason that is not merely
 * tidiness. The competitor scraper reads the *neutral* public product page: `merchantId` is
 * stripped from its URL precisely because a merchant-scoped request comes back reporting that
 * merchant as the winner on every row, regardless of the real buybox order (measured
 * 2026-08-17 against the official buybox endpoint, which reported rank 8 for a product the
 * merchant-scoped page reported us 1st on — `public-page/source.ts`).
 *
 * This port does the opposite: it asks for the page **as** one merchant, because that is what
 * makes the page carry that merchant's business identity. Everything it returns is therefore
 * suspect as an *ordering* and trustworthy only as an *identity*.
 *
 * ⚠️ **That is why no type in this file has a rank, a winner flag or a price.** Doc 12 Faz 7's
 * definition of done — "rank is never read from this response" — is enforced by the shape of
 * the return value rather than by a rule someone has to remember: there is nowhere to put it.
 * A caller that wants a rank has to go to `ICompetitorSource` and fetch the neutral page.
 *
 * ⚠️ **Reporting only,** on the same terms as every other scraper here. Nothing this port
 * produces may gate a pricing decision, and a failure is recorded and the run continues.
 *
 * Retention: guide §29 is explicit that business/contact metadata is collected **only** where
 * the application needs it. It does here — a brand owner's compliance officer writing a notice
 * needs the firm's registered title, tax number and KEP address, and the tax number is also the
 * key that matches an observed storefront to a name on the operator's authorised-seller list
 * (Faz 5). What is *not* needed is collecting it for every seller as a side effect of every
 * scrape, which is why this is an on-demand port and not a field on `CompetitorOffer`.
 */
import type { MarketplaceCode } from '@buybox/core';
import type { ProductPageRef } from './competitor-source.js';

/**
 * One of the seller's listings on the product the identity was resolved through.
 *
 * Carried because the same request that answers "who is this firm?" also answers "what exactly
 * is this firm shipping?" at no extra cost, and a notice about counterfeit or grey-market goods
 * names the barcode. Deliberately **not** an offer: there is no price, no rank and no winner
 * flag here — see this file's header.
 */
export interface SellerListingFact {
  /** The seller's own commercial listing id (guide §10) — distinct from the merchant id. */
  readonly listingRef: string | null;
  /** Trendyol `itemNumber`: the variant this listing is for. */
  readonly itemRef: string | null;
  readonly barcode: string | null;
  /** Units the page reports available. `null` when the payload stated none — never `0` for unknown. */
  readonly offeredStock: number | null;
}

/**
 * The firm behind a storefront, as the marketplace states it.
 *
 * Every field is `null` when the payload did not carry it. None is ever inferred, and none is
 * ever read from display text: these are the marketplace's own structured fields or nothing
 * (guide §26).
 */
export interface SellerIdentity {
  readonly marketplaceCode: MarketplaceCode;
  /** The merchant id the caller asked for, echoed back — see `SellerIdentityError` 'identityMismatch'. */
  readonly sellerRef: string;
  /** The storefront's display name. */
  readonly sellerName: string | null;
  /** Registered commercial title (`unvan`) — the name that goes on a notice. */
  readonly officialName: string | null;
  /** Turkish tax number (VKN) or national id (TCKN) for a sole trader. The Faz 5 matching key. */
  readonly taxNumber: string | null;
  /** Tax office (`vergi dairesi`). */
  readonly taxOffice: string | null;
  /** KEP — the registered electronic mail address a formal notice is legally served to. */
  readonly registeredEmailAddress: string | null;
  readonly address: string | null;
  readonly cityName: string | null;
  readonly countryName: string | null;
  readonly listings: readonly SellerListingFact[];
}

/**
 * Counters proving what the resolver actually found, on the same principle as
 * `ScrapeDiagnostics`: a marketplace that quietly stops publishing tax numbers must show up as
 * a metric, not as an identity panel that has been blank for three weeks.
 */
export interface SellerIdentityDiagnostics {
  readonly parserVersion: string;
  readonly stateFound: boolean;
  readonly merchantFound: boolean;
  /** The merchant the page returned is the one that was asked for. False raises, never returns. */
  readonly identityMatched: boolean;
  /** How many of the identity fields the payload actually carried, out of those we read. */
  readonly identityFieldsFound: number;
  readonly listingCount: number;
}

export interface SellerIdentitySnapshot {
  readonly identity: SellerIdentity;
  /** The URL actually fetched, after redirects — carries the `merchantId` this port added. */
  readonly fetchedUrl: string;
  readonly resolvedAt: Date;
  readonly diagnostics: SellerIdentityDiagnostics;
}

/**
 * `identityMismatch` is its own kind, and it is the one that matters most.
 *
 * If Trendyol ignores the `merchantId` we asked for — because the seller no longer offers that
 * product, or because the parameter stops working — the page still comes back, still parses,
 * and still carries *somebody's* tax number. Writing that number onto the seller we asked about
 * would attribute one company's identity to another, in a record an operator may act on
 * legally. It is a hard failure, never a partial result.
 */
export type SellerIdentityFailureKind = 'fetchFailed' | 'parseFailed' | 'identityMismatch';

export class SellerIdentityError extends Error {
  constructor(
    message: string,
    readonly kind: SellerIdentityFailureKind,
    override readonly cause?: unknown,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'SellerIdentityError';
  }
}

export interface ISellerIdentitySource {
  readonly code: MarketplaceCode;
  /**
   * Resolves one seller, through one product page they are known to sell on.
   *
   * `sellerRef` is the marketplace merchant id, as stored on the observation rows. `ref`
   * addresses a product the seller was seen offering; the implementation is free to require
   * one, since there is no other way to reach a merchant-scoped page.
   *
   * Throws `SellerIdentityError`. The caller records the failure and moves on — it may never
   * propagate into a pricing decision.
   */
  resolveSellerIdentity(ref: ProductPageRef, sellerRef: string): Promise<SellerIdentitySnapshot>;
  /** Releases any owned resource (a Playwright browser). Worker shutdown only. */
  close?(): Promise<void>;
}
