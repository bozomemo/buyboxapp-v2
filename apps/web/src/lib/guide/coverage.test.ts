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

  /**
   * doc 19 §3 "no internal names" and "not how competitor data is collected", for the text a
   * customer actually sees (the `<!-- kaynak -->` comments are stripped before this). Catches the
   * obvious spellings; it is a floor under review, not a replacement for it.
   */
  const FORBIDDEN: readonly [RegExp, string][] = [
    [/\/api\//, 'API path'],
    [/\b[A-Z][A-Z0-9]*_[A-Z0-9_]{2,}\b/, 'environment-variable-like name'],
    [/\b(Scrape|Sweep|Evaluate|Prune|Submit|Confirm)[A-Z][A-Za-z]+\b/, 'job class name'],
    [/scrap|playwright|impersonat|headless|user[- ]agent/i, 'how competitor data is collected'],
    [/herkese açık (ürün )?sayfa|sayfa(sı|ları)? okun/i, 'how competitor data is collected'],
  ];
  const forbiddenIn = (text: string) => FORBIDDEN.filter(([re]) => re.test(text)).map(([, why]) => why);

  it('the forbidden-text check recognises what it is meant to', () => {
    expect(forbiddenIn('Veri pazaryerinin herkese açık sayfalarından toplanır.')).toEqual([
      'how competitor data is collected',
    ]);
    expect(forbiddenIn('ScrapeCompetitors işi')).toContain('job class name');
    expect(forbiddenIn('SMTP_HOST ayarı')).toEqual(['environment-variable-like name']);
    expect(forbiddenIn('Fiyat gönderimi kapalı.')).toEqual([]);
  });

  it('rendered text names nothing internal (doc 19 §3)', () => {
    // Bold spans are UI labels quoted verbatim (doc 19 §3 allows a label exactly as the UI shows
    // it, e.g. the tracked-product status **Sayfa okunamadı**), so they are not checked here.
    const prose = (body: string) => body.replace(/\*\*[^*]+\*\*/g, '');
    const found = topics.flatMap((t) => forbiddenIn(prose(t.body)).map((why) => `${t.id}: ${why}`));
    expect(found).toEqual([]);
  });

  it('the generated module matches the content folder (run npm run guide:gen)', () => {
    expect(RAW_TOPICS.map((r) => r.file)).toEqual(contentFiles);
    for (const r of RAW_TOPICS) expect(r.source).toBe(readFileSync(path.join(CONTENT_DIR, r.file), 'utf8'));
  });
});
