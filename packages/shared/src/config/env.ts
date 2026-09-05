/**
 * Bootstrap configuration — the only layer allowed to come from environment variables
 * (docs/10-target-architecture.md §8). Everything else (marketplace credentials, fee
 * settings, policies) lives in the secret store or the database, never here.
 */
import { z } from 'zod';

export const BootstrapEnvSchema = z.object({
  /** Drizzle connection string; dialect is inferred from its scheme. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Key used to derive the local secret-store encryption key. Never the secret itself. */
  SECRET_STORE_KEY: z.string().min(1, 'SECRET_STORE_KEY is required'),
  /** Path to the encrypted secret-store file. Defaults alongside a local SQLite install. */
  SECRET_STORE_PATH: z.string().min(1).optional().default('./data/secrets.enc.json'),
  /**
   * `User-Agent` the reporting scraper identifies itself with (doc 04 §1.5 requires a
   * user-agent policy; api-references §1.6). Deployment configuration because it should carry
   * real contact details; the default identifies the client honestly but anonymously, and
   * never impersonates a browser.
   */
  SCRAPER_USER_AGENT: z.string().min(1).optional().default('BuyBoxApp/1.0 (repricing; reporting-only)'),
  /**
   * `User-Agent` for the reporting sources that will not answer an honest one. Today that is
   * Trendyol's public pages (403 to an honest agent even at a conservative rate, confirmed
   * 2026-08-17). Hepsiburada's listings endpoint was the original reason for this variable
   * (403 header-by-header on 2026-08-13) but answered an honest bare request on 2026-08-28, so
   * it went back to `SCRAPER_USER_AGENT` and its impersonation now lives behind
   * `HEPSIBURADA_IMPERSONATE_BROWSER` below. Impersonation is an exception the product owner
   * grants per source against a measurement, not the policy.
   *
   * Deployment configuration because it goes stale: a user agent naming a browser version that
   * no longer exists is itself a bot signal, so it is expected to be refreshed periodically
   * without a code change.
   */
  SCRAPER_BROWSER_USER_AGENT: z
    .string()
    .min(1)
    .optional()
    .default(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    ),
  /**
   * '1' puts Hepsiburada's public listings source back on the 2026-08-13 browser header set
   * (api-references §2.11).
   *
   * Defaults to '0'. The endpoint refused honest requests when it was first measured and
   * accepted them when re-measured on 2026-08-28, so the exception was withdrawn to a switch
   * rather than deleted: if the 403s come back, an operator flips this instead of waiting for a
   * release. A 403 from that source names this variable in its message for the same reason.
   */
  HEPSIBURADA_IMPERSONATE_BROWSER: z
    .union([z.literal('0'), z.literal('1')])
    .optional()
    .default('0'),
  /** '1' boots the worker's scheduler inside the Next.js process (single-host install). */
  SINGLE_PROCESS: z
    .union([z.literal('0'), z.literal('1')])
    .optional()
    .default('0'),
  /**
   * '1' lets the worker apply pending migrations itself at boot instead of refusing to start
   * (doc 14 §5.2). Written **only** by the customer installer, which has nobody at a terminal
   * to run `npm run migrate`; a development checkout leaves it unset and keeps the explicit,
   * refuse-and-say-so behaviour that makes an unexpected schema change visible.
   *
   * It never authorises a *downgrade*: a database ahead of the running build still refuses.
   */
  AUTO_MIGRATE: z
    .union([z.literal('0'), z.literal('1')])
    .optional()
    .default('0'),
  /**
   * Where new audit findings are pushed, if anywhere (2026-09-03).
   *
   * Bootstrap configuration rather than a settings row because **the URL is a credential**: a
   * Slack or Teams webhook address is a bearer token in URL form, and CLAUDE.md's hard rule
   * forbids a credential in a database column. Absent is the normal state and disables pushing
   * entirely; the findings are still derived, still stored and still on the screen — an install
   * that has configured nothing loses a notification, never a finding.
   */
  FINDINGS_WEBHOOK_URL: z.string().url().optional(),
});

export type BootstrapEnv = z.infer<typeof BootstrapEnvSchema>;

export function parseBootstrapEnv(source: Record<string, string | undefined>): BootstrapEnv {
  return BootstrapEnvSchema.parse(source);
}
