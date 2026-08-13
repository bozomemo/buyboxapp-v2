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
