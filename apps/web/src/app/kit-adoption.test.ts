// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every screen under `apps/web/src/app/` must not hand-roll a control the shared kit already
 * covers — a raw `<button>`, a text `<input>`, a `<select>`, a page `<h1>` instead of
 * `PageHeader`, or the old `px-2! py-1!` squeeze on a `Button` (spec 2026-11-03 §7).
 *
 * The 2026-11-03 redesign's phase 3 (plan `2026-11-03-ui-redesign-phase-3-rest.md`) converts
 * the screens that phase 2 left; until it is done they sit on `PENDING`. A pending file must
 * still violate, so the list can only shrink as screens are converted — never go stale.
 *
 * Two escapes, both explicit: a checkbox/radio/file/hidden input is not something `TextInput`
 * covers, and a control the kit has no equivalent for carries `kit-exempt: <reason>` on one of
 * the two lines above it.
 */
const APP_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

export const PENDING: readonly string[] = [
  'account/account-client.tsx',
  'account/mfa-setup/mfa-setup-client.tsx',
  'account/password/password-client.tsx',
  'alerts/alerts-client.tsx',
  'brands/brands-client.tsx',
  'competitors/competitors-client.tsx',
  'competitors/sellers/sellers-client.tsx',
  'competitors/sellers/[marketplace]/[ref]/seller-detail-client.tsx',
  'dashboard-client.tsx',
  'license/license-client.tsx',
  'listings/listings-client.tsx',
  'listings/[id]/listing-detail-client.tsx',
  'login/mfa/mfa-challenge-client.tsx',
  'nav-shell.tsx',
  'setup/setup-wizard.tsx',
  'setup/steps/step1-database.tsx',
  'setup/steps/step4-fees.tsx',
  'setup/steps/step6-product-source.tsx',
  'stock/stock-client.tsx',
  'tracked-products/[id]/tracked-product-detail-client.tsx',
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
  for (const m of source.matchAll(/<button\b|<input\b|<select\b|<h1\b|px-2! py-1!/g)) {
    const index = m.index ?? 0;
    const line = lineOf(index);
    if (exempt(line)) continue;
    if (m[0] === '<input' && NON_TEXT_INPUT.test(tagText(source, index))) continue;
    found.push(`line ${line + 1}: ${m[0]}`);
  }
  return found;
}

/** Every screen file under `app/`, relative and with `/`, tests excluded. */
function screenFiles(dir: string = APP_DIR): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return screenFiles(full);
    return name.endsWith('.tsx') && !name.endsWith('.test.tsx')
      ? [path.relative(APP_DIR, full).split(path.sep).join('/')]
      : [];
  });
}

const read = (file: string) => readFileSync(path.join(APP_DIR, file), 'utf8').replace(/\r\n/g, '\n');

describe('violations', () => {
  it.each([
    ['<button className="x">', 1],
    ['{/* kit-exempt: sort */}\n<button>', 0],
    ['<input type="checkbox" />', 0],
    ['<input value={v} onChange={(e) => s(e)} />', 1],
    ['<select>', 1],
    ['className="px-2! py-1! text-xs"', 1],
    ['<h1 className="x">', 1],
  ])('%s → %d', (source, count) => {
    expect(violations(source)).toHaveLength(count);
  });
});

describe('every screen under app/ uses the kit', () => {
  it.each(screenFiles().filter((f) => !PENDING.includes(f)))('%s', (file) => {
    expect(violations(read(file))).toEqual([]);
  });
});

describe('pending files still need converting', () => {
  it.each(PENDING.length > 0 ? PENDING : ['(none)'])('%s', (file) => {
    if (file === '(none)') return;
    expect(violations(read(file)).length).toBeGreaterThan(0);
  });
});
