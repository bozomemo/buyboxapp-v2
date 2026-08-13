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
   * `User-Agent` for the one reporting source that will not answer an honest one: Hepsiburada's
   * public listings endpoint returns 403 to anything not shaped like a browser (verified
   * header-by-header 2026-08-13, api-references §2.11). Impersonation there is an exception the
   * product owner granted explicitly, not the policy — `SCRAPER_USER_AGENT` above stays the
   * default everywhere it works, and the job that uses this still ships disabled.
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
  /** '1' boots the worker's scheduler inside the Next.js process (single-host install). */
  SINGLE_PROCESS: z
    .union([z.literal('0'), z.literal('1')])
    .optional()
    .default('0'),
});

export type BootstrapEnv = z.infer<typeof BootstrapEnvSchema>;

export function parseBootstrapEnv(source: Record<string, string | undefined>): BootstrapEnv {
  return BootstrapEnvSchema.parse(source);
}
