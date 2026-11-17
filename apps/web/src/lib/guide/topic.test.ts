// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { APP_MODULES } from '@buybox/shared';
import { GUIDE_MODULES, headingSlug, parseTopic, parseTopics } from './topic';

describe('GUIDE_MODULES', () => {
  it('is the app module list', () => {
    expect([...GUIDE_MODULES].sort()).toEqual([...APP_MODULES].sort());
  });
});

const VALID = `---
id: listings
title: İlanlar
section: screens
order: 20
module: seller
routes:
  - /listings
  - /listings/[id]
---

Giriş metni.

## Fiyat neden değişmedi?

Metin.

### Ayrıntı

<!-- kaynak: doc 03 §2 -->
`;

describe('parseTopic', () => {
  it('reads the frontmatter fields', () => {
    const t = parseTopic('listings.md', VALID);
    expect(t).toMatchObject({
      id: 'listings',
      title: 'İlanlar',
      section: 'screens',
      order: 20,
      module: 'seller',
      routes: ['/listings', '/listings/[id]'],
    });
  });

  it('reads module null and an empty routes list', () => {
    const t = parseTopic('faq.md', '---\nid: faq\ntitle: SSS\nsection: faq\norder: 1\nmodule: null\nroutes: []\n---\nMetin.\n');
    expect(t.module).toBeNull();
    expect(t.routes).toEqual([]);
  });

  it('strips the source comment from the body', () => {
    const t = parseTopic('listings.md', VALID);
    expect(t.body).not.toContain('kaynak');
    expect(t.body).toContain('Giriş metni.');
  });

  it('lists level 2 and 3 headings with Turkish-aware slugs', () => {
    const t = parseTopic('listings.md', VALID);
    expect(t.headings).toEqual([
      { depth: 2, text: 'Fiyat neden değişmedi?', slug: 'fiyat-neden-degismedi' },
      { depth: 3, text: 'Ayrıntı', slug: 'ayrinti' },
    ]);
  });

  const broken: [string, string][] = [
    ['missing title', VALID.replace('title: İlanlar\n', '')],
    ['unknown section', VALID.replace('section: screens', 'section: foo')],
    ['unknown module', VALID.replace('module: seller', 'module: x')],
    ['bad id', VALID.replace('id: listings', 'id: Bad_Id')],
    ['relative route', VALID.replace('  - /listings\n', '  - listings\n')],
    ['missing order', VALID.replace('order: 20\n', '')],
    ['missing frontmatter', 'Sadece metin.\n'],
  ];
  it.each(broken)('refuses a file with %s, naming the file', (_name, source) => {
    expect(() => parseTopic('bozuk.md', source)).toThrow(/bozuk\.md/);
  });
});

describe('parseTopics', () => {
  it('refuses a duplicate id, naming both files', () => {
    expect(() =>
      parseTopics([
        { file: 'a.md', source: VALID },
        { file: 'b.md', source: VALID },
      ]),
    ).toThrow(/a\.md.*b\.md|b\.md.*a\.md/);
  });
});

describe('headingSlug', () => {
  it.each([
    ['Şifremi unuttum', 'sifremi-unuttum'],
    ['İlk adımlar: kurulum', 'ilk-adimlar-kurulum'],
    ['Çöp  Ğ Ü Ö', 'cop-g-u-o'],
    ['  Taban fiyat (floor)  ', 'taban-fiyat-floor'],
  ])('%s → %s', (text, slug) => {
    expect(headingSlug(text)).toBe(slug);
  });
});
