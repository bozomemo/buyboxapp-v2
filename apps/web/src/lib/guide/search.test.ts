// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { foldTr, searchTopics } from './search';
import { parseTopic } from './topic';

const topic = (id: string, title: string, body: string) =>
  parseTopic(`${id}.md`, `---\nid: ${id}\ntitle: ${title}\nsection: screens\norder: 1\nmodule: null\nroutes: []\n---\n${body}\n`);

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
