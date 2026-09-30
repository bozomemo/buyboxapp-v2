// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * doc 18 §7.2 for pages: every `page.tsx` checks the session and permission itself, on the
 * server, before rendering. Pages are components, so this reads source rather than importing
 * them — the check is that the call is there, and `page-guard.tsx` is what makes it right.
 */
const APP_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

/** Reachable before sign-in, by design (doc 18 §7.3). */
const PUBLIC_PAGES = new Set(['login/page.tsx', 'login/mfa/page.tsx', 'bootstrap/page.tsx']);

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'api' ? [] : pages(full);
    return entry === 'page.tsx' ? [full] : [];
  });
}

describe('every page checks access on the server', () => {
  const all = pages(APP_DIR).map((file) => ({
    rel: path.relative(APP_DIR, file).replace(/\\/g, '/'),
    source: readFileSync(file, 'utf8'),
  }));

  it('finds the pages', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it('calls requirePermission or requireSession, outside the public pages', () => {
    const unguarded = all
      .filter((p) => !PUBLIC_PAGES.has(p.rel))
      .filter((p) => !/await require(Permission|Session)\(/.test(p.source))
      .map((p) => p.rel);
    expect(unguarded).toEqual([]);
  });

  it('is a server component, so the check runs on the server', () => {
    expect(all.filter((p) => /^['"]use client['"]/m.test(p.source)).map((p) => p.rel)).toEqual([]);
  });
});
