// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Screens converted to the shared kit in the 2026-11-03 visual redesign (plan
 * `2026-11-03-ui-redesign-phase-2-brand-screens.md`) must not hand-roll a control the kit already
 * covers — a raw `<button>`, a text `<input>`, a `<select>`, or the old `px-2! py-1!` squeeze on a
 * `Button`. Each phase-2 task appends its files to `CONVERTED` before converting them, so this
 * test is how a task proves it is done, and how a later edit is kept from sliding back.
 *
 * Two escapes, both explicit: a checkbox/radio/file/hidden input is not something `TextInput`
 * covers, and a control the kit has no equivalent for carries `kit-exempt: <reason>` on one of
 * the two lines above it.
 */
const APP_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

export const CONVERTED: readonly string[] = ['dashboard-client.tsx', 'tracked-products/tracked-products-client.tsx',
  'watched-brands/findings/findings-client.tsx',
  'watched-brands/sellers/brand-sellers-client.tsx',
  'watched-brands/sellers/seller-identity-panel.tsx',
  'watched-brands/watched-brands-client.tsx',
  'watched-brands/policy/policy-client.tsx',
  'watched-brands/cross-marketplace/cross-marketplace-client.tsx',
  'watched-brands/comparison/brand-comparison-client.tsx',
  'brand/products/brand-products-client.tsx',
  'brand/products/import-panel.tsx',
  'brand/products/[id]/brand-product-detail-client.tsx',
  'brand/listings/listings-client.tsx',
];

const NON_TEXT_INPUT = /type=["'](checkbox|radio|file|hidden)["']/;

/** The tag's own text, up to the first `>` that is not the tail of an arrow `=>`. */
function tagText(source: string, start: number): string {
  for (let i = start; i < source.length; i++) {
    if (source[i] === '>' && source[i - 1] !== '=') return source.slice(start, i + 1);
  }
  return source.slice(start);
}

export function violations(source: string): string[] {
  const lines = source.split('\n');
  const lineOf = (index: number) => source.slice(0, index).split('\n').length - 1;
  const exempt = (line: number) => [line - 1, line - 2].some((l) => l >= 0 && lines[l]?.includes('kit-exempt:'));
  const found: string[] = [];
  for (const m of source.matchAll(/<button\b|<input\b|<select\b|px-2! py-1!/g)) {
    const index = m.index ?? 0;
    const line = lineOf(index);
    if (exempt(line)) continue;
    if (m[0] === '<input' && NON_TEXT_INPUT.test(tagText(source, index))) continue;
    found.push(`line ${line + 1}: ${m[0]}`);
  }
  return found;
}

describe('violations', () => {
  it.each([
    ['<button className="x">', 1],
    ['{/* kit-exempt: sort */}\n<button>', 0],
    ['<input type="checkbox" />', 0],
    ['<input value={v} onChange={(e) => s(e)} />', 1],
    ['<select>', 1],
    ['className="px-2! py-1! text-xs"', 1],
  ])('%s → %d', (source, count) => {
    expect(violations(source)).toHaveLength(count);
  });
});

describe('converted brand screens use the kit', () => {
  it.each(CONVERTED.length > 0 ? CONVERTED : ['(none yet)'])('%s', (file) => {
    if (file === '(none yet)') return;
    expect(violations(readFileSync(path.join(APP_DIR, file), 'utf8').replace(/\r\n/g, '\n'))).toEqual([]);
  });
});
