import type { GuideTopic } from './topic';

/** Lowercases the Turkish way, so "İlan" and "ilan", "IŞIK" and "ışık" compare equal (doc 19 §5). */
export function foldTr(s: string): string {
  return s.toLocaleLowerCase('tr-TR');
}

/**
 * Words the customer types for what the guide calls something else. The search box suggests
 * "şifre", but the guide says "parola" throughout, so "şifre" missed every password topic
 * (2026-11-19 walkthrough). Each group is searched as a whole: a query containing one of its
 * words also matches the others. Folded, lowercase.
 */
const SYNONYMS: readonly (readonly string[])[] = [
  ['şifre', 'parola'],
  ['dip fiyat', 'taban fiyat', 'minimum fiyat', 'en düşük fiyat'],
  ['2fa', 'iki adımlı', 'doğrulama kodu'],
];

/** The query, plus the query with each synonym swapped in. */
function variants(q: string): string[] {
  const out = new Set([q]);
  for (const group of SYNONYMS) {
    for (const word of group) {
      if (!q.includes(word)) continue;
      for (const other of group) out.add(q.replace(word, other));
    }
  }
  return [...out];
}

type Searchable = Pick<GuideTopic, 'title' | 'headings' | 'body'>;

/** Title hits first, then heading hits, then body hits; a blank query returns everything. */
export function searchTopics<T extends Searchable>(topics: readonly T[], query: string): readonly T[] {
  const q = foldTr(query.trim());
  if (q === '') return topics;
  const qs = variants(q);
  const hit = (text: string) => {
    const folded = foldTr(text);
    return qs.some((v) => folded.includes(v));
  };
  const rank = (t: T): number => {
    if (hit(t.title)) return 0;
    if (t.headings.some((h) => hit(h.text))) return 1;
    if (hit(t.body)) return 2;
    return 3;
  };
  return topics
    .map((t, i) => ({ t, i, r: rank(t) }))
    .filter(({ r }) => r < 3)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ t }) => t);
}
