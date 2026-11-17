// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { topicIdForPath } from './route-match';
import { GUIDE_ROUTE_INDEX } from './generated-routes';
import { GUIDE_TOPICS } from './topics';

const INDEX = [
  { id: 'panel', routes: ['/'] },
  { id: 'listings', routes: ['/listings', '/listings/[id]'] },
  { id: 'competitor-sellers', routes: ['/competitors/sellers'] },
  { id: 'seller-detail', routes: ['/competitors/sellers/[marketplace]/[ref]'] },
  { id: 'brands', routes: ['/brands'] },
  { id: 'brand-products', routes: ['/brand/products', '/brand/products/[id]'] },
  { id: 'specific', routes: ['/x/new'] },
  { id: 'generic', routes: ['/x/[id]'] },
];

describe('topicIdForPath', () => {
  it.each([
    ['/listings/123', 'listings'],
    ['/listings', 'listings'],
    ['/competitors/sellers/trendyol/abc', 'seller-detail'],
    ['/competitors/sellers', 'competitor-sellers'],
    ['/brands', 'brands'],
    ['/brand/products/7', 'brand-products'],
    ['/', 'panel'],
    ['/listings/', 'listings'],
    ['/x/new', 'specific'],
    ['/x/9', 'generic'],
  ])('%s → %s', (path, id) => {
    expect(topicIdForPath(path, INDEX)).toBe(id);
  });

  it.each(['/nope', '/brand', '/listings/1/2'])('%s → null', (path) => {
    expect(topicIdForPath(path, INDEX)).toBeNull();
  });

  it('the client route index agrees with the parsed topics', () => {
    const parsed = GUIDE_TOPICS.filter((t) => t.routes.length > 0)
      .map((t) => ({ id: t.id, routes: [...t.routes] }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const index = GUIDE_ROUTE_INDEX.map((t) => ({ id: t.id, routes: [...t.routes] })).sort((a, b) => a.id.localeCompare(b.id));
    expect(index).toEqual(parsed);
  });

  it('works on the real index for the guide itself', () => {
    expect(topicIdForPath('/rehber/listings', GUIDE_ROUTE_INDEX)).toBe('guide');
  });
});
