// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `next/font` only runs inside the Next compiler, so this reads `fonts.ts` as text. What it pins
 * is the part a reviewer would miss: without the `latin-ext` subset, ş/ğ/ı/İ fall back to another
 * font mid-word on every Turkish label.
 */
const APP_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const source = readFileSync(path.join(APP_DIR, 'fonts.ts'), 'utf8');

describe('fonts.ts', () => {
  it('loads latin-ext', () => {
    expect(source.match(/'latin-ext'/g)).toHaveLength(2);
  });

  it('sans weights', () => {
    expect(source).toContain('IBM_Plex_Sans');
    expect(source).toContain("weight: ['400', '500', '600', '700']");
  });

  it('mono weights', () => {
    expect(source).toContain('IBM_Plex_Mono');
    expect(source).toContain("weight: ['400', '500', '600']");
  });
});
