// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/contrast';

/**
 * The palette's contrast rules (spec 2026-11-03-ui-redesign §3.4), measured against the values
 * actually in `globals.css` rather than a copy of them, so a token edit that breaks a pair fails
 * here instead of in front of a customer. Also pins that the two dark blocks — the system
 * preference and the explicit "Koyu" choice — never drift apart.
 */
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(APP_DIR, 'globals.css'), 'utf8');

/** Custom properties declared in the first `{…}` after `selector`. */
function block(source: string, selector: string): Map<string, string> {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  const body = source.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
  const props = new Map<string, string>();
  for (const [, name = '', value = ''] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) props.set(name, value.trim());
  return props;
}

/** One token's value, failing loudly when the token is missing rather than comparing `undefined`. */
function tokens(selector: string): (name: string) => string {
  const props = block(css, selector);
  return (name) => {
    const value = props.get(name);
    if (value === undefined) throw new Error(`${name} missing from ${selector}`);
    return value;
  };
}

describe('contrastRatio', () => {
  it.each([
    ['#000000', '#FFFFFF', 21],
    ['#FFFFFF', '#FFFFFF', 1],
    ['#777777', '#FFFFFF', 4.48],
  ])('%s on %s is %d', (a, b, expected) => {
    expect(contrastRatio(a, b)).toBeCloseTo(expected, 1);
  });

  it('rejects anything but #rrggbb', () => {
    expect(() => contrastRatio('rgba(0,0,0,.5)', '#FFFFFF')).toThrow();
  });
});

describe('theme blocks', () => {
  it('dark blocks are identical', () => {
    expect(block(css, ":root:not([data-theme='light'])")).toEqual(block(css, ":root[data-theme='dark']"));
  });

  it('no neon value survives', () => {
    for (const v of ['#22d3ee', '#05070a', '#ff3b47', '#16e37e']) expect(css.toLowerCase()).not.toContain(v);
  });
});

describe.each([
  ['light', ':root {'],
  ['dark', ":root[data-theme='dark']"],
])('%s contrast ≥ 4.5', (_, selector) => {
  const t = tokens(selector);

  it.each(['danger', 'warning', 'success'])('%s on bg, surface and its own -bg', (s) => {
    for (const ground of [t('--color-bg'), t('--color-surface'), t(`--color-${s}-bg`)])
      expect(contrastRatio(t(`--color-${s}`), ground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['accent', 'danger', 'warning', 'success'])('%s-ink on solid %s', (s) => {
    expect(contrastRatio(t(`--color-${s}-ink`), t(`--color-${s}`))).toBeGreaterThanOrEqual(4.5);
  });

  it('pairs drawn together stay legible', () => {
    expect(contrastRatio(t('--color-muted'), t('--color-thead'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('--color-warning-strong'), t('--color-warning-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('--color-strong-ink'), t('--color-strong-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['muted', 'link'])('%s on bg and surface', (k) => {
    for (const ground of [t('--color-bg'), t('--color-surface')])
      expect(contrastRatio(t(`--color-${k}`), ground)).toBeGreaterThanOrEqual(4.5);
  });

  it('sidebar text on sidebar', () => {
    expect(contrastRatio(t('--color-sidebar-text'), t('--color-sidebar'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('--color-sidebar-muted'), t('--color-sidebar'))).toBeGreaterThanOrEqual(4.5);
    for (const ground of [t('--color-sidebar-raised'), t('--color-sidebar-hover')])
      expect(contrastRatio(t('--color-sidebar-text'), ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('--color-sidebar-active-text'), t('--color-sidebar-active-bg'))).toBeGreaterThanOrEqual(4.5);
  });
});
