import type { GuideTopic } from './topic';

/** Lowercases the Turkish way, so "İlan" and "ilan", "IŞIK" and "ışık" compare equal (doc 19 §5). */
export function foldTr(s: string): string {
  return s.toLocaleLowerCase('tr-TR');
}

type Searchable = Pick<GuideTopic, 'title' | 'headings' | 'body'>;

/** Title hits first, then heading hits, then body hits; a blank query returns everything. */
export function searchTopics<T extends Searchable>(topics: readonly T[], query: string): readonly T[] {
  const q = foldTr(query.trim());
  if (q === '') return topics;
  const rank = (t: T): number => {
    if (foldTr(t.title).includes(q)) return 0;
    if (t.headings.some((h) => foldTr(h.text).includes(q))) return 1;
    if (foldTr(t.body).includes(q)) return 2;
    return 3;
  };
  return topics
    .map((t, i) => ({ t, i, r: rank(t) }))
    .filter(({ r }) => r < 3)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ t }) => t);
}
