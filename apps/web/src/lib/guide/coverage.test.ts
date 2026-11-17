// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduleForPath } from '@/lib/module-routes';
import { RAW_TOPICS } from './generated';
import { parseTopics } from './topic';

/**
 * doc 19 §8: the guide cannot silently fall behind the app's pages. Reads the content folder
 * itself rather than the generated module, so a forgotten `guide:gen` cannot hide a gap — and
 * the last test catches the forgotten `guide:gen` instead.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '../../app');
const CONTENT_DIR = path.resolve(HERE, '../../../content/rehber');

function pageRoutes(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'api' ? [] : pageRoutes(full, `${prefix}/${entry}`);
    return entry === 'page.tsx' ? [prefix === '' ? '/' : prefix] : [];
  });
}

const contentFiles = readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();
const topics = parseTopics(
  contentFiles.map((file) => ({ file, source: readFileSync(path.join(CONTENT_DIR, file), 'utf8') })),
);
const pages = pageRoutes(APP_DIR).sort();

describe('the guide covers the app (doc 19 §8)', () => {
  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThan(30);
  });

  it('every page is claimed by exactly one topic', () => {
    const claims = new Map<string, string[]>();
    for (const t of topics) for (const r of t.routes) claims.set(r, [...(claims.get(r) ?? []), t.id]);
    const unclaimed = pages.filter((p) => !claims.has(p));
    const doubled = [...claims]
      .filter(([, ids]) => ids.length > 1)
      .map(([r, ids]) => `${r}: ${ids.join(', ')}`);
    expect({ unclaimed, doubled }).toEqual({ unclaimed: [], doubled: [] });
  });

  it('no topic claims a page that does not exist', () => {
    const dead = topics.flatMap((t) =>
      t.routes.filter((r) => !pages.includes(r)).map((r) => `${t.id}: ${r}`),
    );
    expect(dead).toEqual([]);
  });

  it("a topic's module matches every route it claims", () => {
    const wrong = topics.flatMap((t) =>
      t.routes
        .map((r) => ({ r, m: moduleForPath(r.replace(/\[[^\]]+\]/g, 'x')) }))
        .filter(({ m }) => m !== t.module)
        .map(({ r, m }) => `${t.id}: ${r} is ${m ?? 'null'}, topic says ${t.module ?? 'null'}`),
    );
    expect(wrong).toEqual([]);
  });

  it('internal links resolve', () => {
    const byId = new Map(topics.map((t) => [t.id, t]));
    const broken: string[] = [];
    for (const t of topics) {
      for (const [, id = '', anchor] of t.body.matchAll(/\]\(\/rehber\/([^)#\s]+)(?:#([^)\s]+))?\)/g)) {
        const target = byId.get(id);
        if (target === undefined) broken.push(`${t.id} → ${id}`);
        else if (anchor !== undefined && !target.headings.some((h) => h.slug === anchor))
          broken.push(`${t.id} → ${id}#${anchor}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('the generated module matches the content folder (run npm run guide:gen)', () => {
    expect(RAW_TOPICS.map((r) => r.file)).toEqual(contentFiles);
    for (const r of RAW_TOPICS) expect(r.source).toBe(readFileSync(path.join(CONTENT_DIR, r.file), 'utf8'));
  });
});
