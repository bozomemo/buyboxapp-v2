/**
 * The web process's single `AppDatabase` connection, opened once per Node process (Next.js
 * dev-mode module reloads aside — `globalThis` caching avoids exhausting connection pools on
 * hot reload, the same pattern the Next.js docs recommend for Prisma).
 *
 * Bootstrap config (doc 10 §8) is environment variables, but the setup wizard (doc 06 §setup,
 * doc 10 §6) must be able to configure `DATABASE_URL`/`SECRET_STORE_KEY` on a fresh install
 * with **no file editing by the operator** (doc 12 6.2 DoD). `writeBootstrapEnv` below is the
 * app writing its own `.env.local` on the operator's behalf and updating the live process env
 * so the change takes effect immediately, without asking the operator to restart or edit
 * anything themselves.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDb, type AppDatabase } from '@buybox/db';
import { BootstrapEnvSchema, parseBootstrapEnv, type BootstrapEnv } from '@buybox/shared';

declare global {
  var __buyboxAppDb: AppDatabase | undefined;
  var __buyboxAppDbUrl: string | undefined;
}

const ENV_LOCAL_PATH = path.join(process.cwd(), '.env.local');

/** `undefined` (not a thrown error) when the wizard's database step hasn't run yet. */
export function tryGetBootstrapEnv(): BootstrapEnv | undefined {
  const parsed = BootstrapEnvSchema.safeParse(process.env);
  return parsed.success ? parsed.data : undefined;
}

export function isBootstrapped(): boolean {
  return tryGetBootstrapEnv() !== undefined;
}

export function getAppDb(): AppDatabase {
  const env = parseBootstrapEnv(process.env);
  if (globalThis.__buyboxAppDb && globalThis.__buyboxAppDbUrl === env.DATABASE_URL) {
    return globalThis.__buyboxAppDb;
  }
  globalThis.__buyboxAppDb?.close();
  globalThis.__buyboxAppDb = createDb(env.DATABASE_URL);
  globalThis.__buyboxAppDbUrl = env.DATABASE_URL;
  return globalThis.__buyboxAppDb;
}

export function getBootstrapEnv(): BootstrapEnv {
  return parseBootstrapEnv(process.env);
}

/**
 * Persists bootstrap values to `.env.local` (creating or appending) and applies them to the
 * current process immediately — called only from the setup wizard's database step.
 */
export async function writeBootstrapEnv(values: Partial<Record<string, string>>): Promise<void> {
  const existing = existsSync(ENV_LOCAL_PATH) ? await readFile(ENV_LOCAL_PATH, 'utf8') : '';
  const lines = new Map<string, string>();
  for (const line of existing.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) lines.set(match[1]!, match[2]!);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    lines.set(key, value);
    process.env[key] = value;
  }
  const content = [...lines.entries()].map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  await writeFile(ENV_LOCAL_PATH, content, 'utf8');
}

/**
 * The inverse of `writeBootstrapEnv`, for a value that has found a better home. Used when a
 * licence pasted before the database existed (and therefore parked in `.env.local`) is adopted
 * into `app_settings`: the environment takes precedence over the stored row (doc 13 §3), so a
 * leftover `LICENSE_TOKEN` line would shadow every future renewal made through the UI.
 */
export async function removeBootstrapEnv(keys: readonly string[]): Promise<void> {
  if (!existsSync(ENV_LOCAL_PATH)) return;
  const existing = await readFile(ENV_LOCAL_PATH, 'utf8');
  const kept = existing
    .split('\n')
    .filter((line) => {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      return !(match && keys.includes(match[1]!));
    })
    .filter((line) => line.trim() !== '');
  for (const key of keys) delete process.env[key];
  await writeFile(ENV_LOCAL_PATH, kept.join('\n') + '\n', 'utf8');
}
