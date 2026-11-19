// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { foldTr, searchTopics } from './search';
import { parseTopic } from './topic';

const topic = (id: string, title: string, body: string) =>
  parseTopic(
    `${id}.md`,
    `---\nid: ${id}\ntitle: ${title}\nsection: screens\norder: 1\nmodule: null\nroutes: []\n---\n${body}\n`,
  );

const LISTINGS = topic('listings', 'İlanlar', 'Fiyat ekranı.');
const STOCK = topic('stock', 'Stok', 'Her ilan bir stok koduna bağlıdır.');
const JOBS = topic('jobs', 'İşler', '## Işık durumu\n\nMetin.');

describe('foldTr', () => {
  it('folds Turkish capitals the Turkish way', () => {
    expect(foldTr('İlanlar')).toBe(foldTr('ilanlar'));
    expect(foldTr('IŞIK')).toBe('ışık');
  });
});

describe('searchTopics', () => {
  it('returns every topic for an empty or blank query', () => {
    expect(searchTopics([LISTINGS, STOCK], '   ')).toEqual([LISTINGS, STOCK]);
  });

  it('finds "İlanlar" from "ilan", ranking the title hit above the body hit', () => {
    expect(searchTopics([STOCK, LISTINGS, JOBS], 'ilan').map((t) => t.id)).toEqual(['listings', 'stock']);
  });

  it('ranks a heading hit between title and body hits', () => {
    const body = topic('body', 'Başka', 'ışık burada.');
    expect(searchTopics([body, JOBS], 'IŞIK').map((t) => t.id)).toEqual(['jobs', 'body']);
  });

  it('finds nothing for an absent word', () => {
    expect(searchTopics([LISTINGS, STOCK], 'zzz')).toEqual([]);
  });
});

/**
 * The search box suggests "şifre", but the guide says "parola" throughout, so "şifre" missed
 * the sign-in, users and account topics (2026-11-19 walkthrough). A few words the customer uses
 * for what the guide calls something else are searched as both.
 */
describe('searchTopics synonyms', () => {
  const PASSWORD = { title: 'Hesabım', headings: [], body: 'Parolanızı buradan değiştirirsiniz.' };
  const FLOOR = { title: 'Taban Fiyat', headings: [], body: 'Altına inilmeyen fiyat.' };
  const OTHER = { title: 'Panel', headings: [], body: 'Güne buradan başlayın.' };

  it('finds "parola" topics from "şifre"', () => {
    expect(searchTopics([OTHER, PASSWORD], 'ŞİFRE')).toEqual([PASSWORD]);
  });

  it('finds "taban fiyat" from "dip fiyat" and "minimum fiyat"', () => {
    expect(searchTopics([OTHER, FLOOR], 'dip fiyat')).toEqual([FLOOR]);
    expect(searchTopics([OTHER, FLOOR], 'minimum fiyat')).toEqual([FLOOR]);
  });
});
