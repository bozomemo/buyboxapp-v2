/**
 * Hepsiburada credentials, hosts and adapter configuration
 * (docs/api-references.md §2.1, §2.2).
 *
 * Verified 2026-08-14 against the vendor's own OpenAPI document, stored at
 * `docs/vendor/hepsiburada-listing-openapi-v1.json`. The only declared security scheme is
 * HTTP Basic, and `User-Agent` is a `required: true` header parameter on every one of the 18
 * listing operations — it is part of the contract, not a convention.
 */
import { z } from 'zod';

export const HepsiburadaCredentialsSchema = z.object({
  /**
   * Path parameter on every merchant-scoped operation, declared `format: uuid`. Obtained from
   * the Merchant Portal / integration configuration (§2.2).
   */
  merchantId: z.string().uuid(),
  /**
   * HTTP Basic username. 🔴 §2.9: whether this is the merchant's own login or an
   * integrator-scoped service key is an account question the documentation cannot answer, and
   * production credentials are separate from SIT ones.
   */
  username: z.string().min(1),
  password: z.string().min(1),
  /**
   * The mandatory `User-Agent`. The vendor documents no required *format*, so this identifies
   * us honestly. It is deliberately **not** `SCRAPER_USER_AGENT` and emphatically not
   * `SCRAPER_BROWSER_USER_AGENT`: browser impersonation is the reporting-only exception granted
   * for §2.11's public endpoint (CLAUDE.md), and has no place on an authenticated control path.
   */
  userAgent: z.string().min(1).default('BuyBoxApp/1.0 (repricing)'),
});

export type HepsiburadaCredentials = z.infer<typeof HepsiburadaCredentialsSchema>;

/**
 * api-references §2.1 — **one host per integration domain**, never a single global base URL.
 * SIT becomes production by removing `-sit`, but the credentials do not carry over.
 */
export const HEPSIBURADA_HOSTS = {
  production: {
    listing: 'https://listing-external.hepsiburada.com',
    orders: 'https://oms-external.hepsiburada.com',
    catalogue: 'https://mpop.hepsiburada.com',
  },
  sit: {
    listing: 'https://listing-external-sit.hepsiburada.com',
    orders: 'https://oms-external-sit.hepsiburada.com',
    catalogue: 'https://mpop-sit.hepsiburada.com',
  },
} as const;

export type HepsiburadaEnvironment = keyof typeof HEPSIBURADA_HOSTS;

/**
 * Reported alongside every submission (§2.6). On a malformed request Hepsiburada returns no
 * upload id at all, and the `x-correlation-id` response header is the only handle the merchant
 * support ticket can use — for up to 7 days. It must be logged whether or not the call
 * succeeded, which is why this is a sink and not a return value.
 */
export interface HepsiburadaCorrelation {
  readonly operation: string;
  readonly correlationId: string | null;
  readonly httpStatus: number;
}

export interface HepsiburadaAdapterConfig {
  readonly credentials: HepsiburadaCredentials;
  /** Defaults to `production`. Ignored when `listingBaseUrl` is given explicitly. */
  readonly environment?: HepsiburadaEnvironment;
  readonly listingBaseUrl?: string;
  /** Injectable for tests — a fixture-backed fake, never a live call (doc 10 §3, §10). */
  readonly fetchFn?: typeof fetch;
  /**
   * Injectable clock, defaulting to `Date.now`. Needed because a listing's campaign price
   * (`pricings[]`) is only the current price inside its own date window, so picking the active
   * one is a time-dependent decision — and a time-dependent decision tested against the wall
   * clock is a test that starts failing on a date nobody chose.
   */
  readonly nowMs?: () => number;
  /** See `HepsiburadaCorrelation`. Called on every price-upload submission attempt. */
  readonly onCorrelation?: (correlation: HepsiburadaCorrelation) => void;
}
