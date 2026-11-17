// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { moduleForPath } from '@/lib/module-routes';
import { parseTopic } from './topic';
import { visibleTopics } from './visible';

const topic = (id: string, module: string) =>
  parseTopic(
    `${id}.md`,
    `---\nid: ${id}\ntitle: ${id}\nsection: screens\norder: 1\nmodule: ${module}\nroutes: []\n---\nx\n`,
  );

describe('visibleTopics', () => {
  const all = [topic('stock', 'seller'), topic('brand-alerts', 'brand'), topic('jobs', 'null')];

  it('drops a switched-off module and keeps shared topics', () => {
    expect(visibleTopics(all, { seller: false, brand: true }).map((t) => t.id)).toEqual([
      'brand-alerts',
      'jobs',
    ]);
  });

  it('keeps everything with both modules on', () => {
    expect(visibleTopics(all, { seller: true, brand: true })).toHaveLength(3);
  });
});

describe('the guide belongs to no module', () => {
  it('is open whichever module is enabled', () => {
    expect(moduleForPath('/rehber')).toBeNull();
    expect(moduleForPath('/rehber/listings')).toBeNull();
  });
});
