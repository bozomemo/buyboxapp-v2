/**
 * Bootstrap mode and the setup token (doc 18 §8.1).
 *
 * Bootstrap mode is "no database configured, or no active Yönetici in it". While it lasts, the
 * setup token — a file in the data directory, readable only by whoever can read that directory —
 * is the one credential the install accepts. Access to the machine is the root of trust
 * (doc 18 §2), and this is where that becomes literal.
 *
 * **The token is never logged.** Logs are shipped to Grafana (doc 16); a token in a log line is
 * a token on the internet. What is logged is the path of the file.
 */
import { existsSync } from 'node:fs';
import { chmod, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appDataDir, authRepo } from '@buybox/db';
import { generateSetupToken, setupTokensEqual } from '@buybox/shared';
import { getAppDb, isBootstrapped } from '../db';

export const SETUP_TOKEN_FILE_NAME = 'bootstrap-token.txt';

export function setupTokenPath(): string {
  return path.join(appDataDir(), SETUP_TOKEN_FILE_NAME);
}

declare global {
  // Positive answers only, per database URL: once an administrator exists the install leaves
  // bootstrap mode, and it only returns through the break-glass CLI or a database switch — the
  // latter changes the URL, which is the cache key. Negative answers are never cached, so the
  // request right after bootstrap completes already sees the administrator.
  var __buyboxHasAdmin: string | undefined;
}

export async function isBootstrapMode(): Promise<boolean> {
  if (!isBootstrapped()) return true;
  const url = process.env.DATABASE_URL ?? '';
  if (globalThis.__buyboxHasAdmin === url) return false;
  try {
    const hasAdmin = await authRepo.hasActiveAdmin(getAppDb());
    if (hasAdmin) globalThis.__buyboxHasAdmin = url;
    return !hasAdmin;
  } catch {
    // An unreadable database (not migrated yet, unreachable) cannot hold an administrator. The
    // setup token is still required for everything bootstrap mode opens, so failing this way
    // opens nothing to a stranger.
    return true;
  }
}

/** Called when the last administrator might have gone — the CLI, a database switch. */
export function forgetAdminCache(): void {
  globalThis.__buyboxHasAdmin = undefined;
}

/**
 * Writes a fresh token when there is none. `regenerate` replaces an existing one — done at boot,
 * so a token copied off a screen yesterday is not good today (doc 18 §8.1).
 */
export async function ensureSetupToken(options: { readonly regenerate?: boolean } = {}): Promise<string> {
  const file = setupTokenPath();
  if (!options.regenerate && existsSync(file)) return file;
  await writeFile(file, `${generateSetupToken()}\n`, { encoding: 'utf8', mode: 0o600 });
  // `mode` applies only when the file is created; an existing file keeps its old mode otherwise.
  await chmod(file, 0o600).catch(() => undefined);
  return file;
}

export async function readSetupToken(): Promise<string | undefined> {
  try {
    const value = (await readFile(setupTokenPath(), 'utf8')).trim();
    return value === '' ? undefined : value;
  } catch {
    return undefined;
  }
}

/** Constant-time; `false` when there is no token file at all. */
export async function isValidSetupToken(typed: string | undefined): Promise<boolean> {
  if (typed === undefined || typed.trim() === '') return false;
  const expected = await readSetupToken();
  return expected !== undefined && setupTokensEqual(expected, typed);
}

export async function deleteSetupToken(): Promise<void> {
  await rm(setupTokenPath(), { force: true });
}
