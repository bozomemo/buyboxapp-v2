import { describe, expect, it } from 'vitest';
import { showsViewSwitch, visibleModules, type ModulesState, type NavView } from './nav-modules';

const both: ModulesState = { status: 'ready', modules: { seller: true, brand: true } };
const brandOnly: ModulesState = { status: 'ready', modules: { seller: false, brand: true } };
const sellerOnly: ModulesState = { status: 'ready', modules: { seller: true, brand: false } };

describe('visibleModules', () => {
  it.each<[string, ModulesState, NavView, { seller: boolean; brand: boolean }]>([
    ['both installed, view all', both, 'all', { seller: true, brand: true }],
    ['both installed, seller view', both, 'seller', { seller: true, brand: false }],
    ['both installed, brand view', both, 'brand', { seller: false, brand: true }],
    [
      'brand-only ignores a stored seller view — a view never enables a module',
      brandOnly,
      'seller',
      { seller: false, brand: true },
    ],
    ['seller-only, view all', sellerOnly, 'all', { seller: true, brand: false }],
    [
      'still loading: neither group flashes in',
      { status: 'loading' },
      'all',
      { seller: false, brand: false },
    ],
    [
      'the poll failed: both, the proxy still guards the routes',
      { status: 'error' },
      'brand',
      { seller: true, brand: true },
    ],
  ])('%s', (_label, state, view, expected) => {
    expect(visibleModules(state, view)).toEqual(expected);
  });
});

describe('showsViewSwitch', () => {
  it('is offered only when both modules are installed', () => {
    expect(showsViewSwitch(both)).toBe(true);
    expect(showsViewSwitch(brandOnly)).toBe(false);
    expect(showsViewSwitch({ status: 'loading' })).toBe(false);
    expect(showsViewSwitch({ status: 'error' })).toBe(false);
  });
});
