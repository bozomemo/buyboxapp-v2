// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOTSTRAP_SETUP_PREFIXES } from '@/lib/auth-access';

/**
 * The proxy lets the setup-token holder reach these screens while the install has no
 * administrator (doc 18 §8.1). A page that then guards itself without `allowSetupAccess` sends
 * the visitor back to `/bootstrap`, and a fresh install loops: `/setup` → `/license` (unlicensed)
 * → `/bootstrap` → "Veritabanı adımına git" → `/setup`. Found 2026-11-18 on `/license`.
 */
const APP = path.dirname(fileURLToPath(import.meta.url));

describe('screens open to the setup token', () => {
  const pages = BOOTSTRAP_SETUP_PREFIXES.filter((prefix) => !prefix.startsWith('/api/'));

  it.each(pages)('%s accepts setup access in its own guard', (prefix) => {
    const file = path.join(APP, prefix.slice(1), 'page.tsx');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toMatch(/requirePermission\([^)]*allowSetupAccess: true/);
  });
});
