import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readStoredNavCollapsed, storeNavCollapsed } from './nav-collapse';

/**
 * This jsdom's `localStorage` is not always a working Storage (see `nav-shell.test.tsx`), so each
 * test installs its own: an in-memory one, or one that throws like a blocked private window.
 */
const original = Object.getOwnPropertyDescriptor(window, 'localStorage');

function installStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): void {
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}

beforeEach(() => {
  const data = new Map<string, string>();
  installStorage({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  });
});

afterEach(() => {
  if (original) Object.defineProperty(window, 'localStorage', original);
});

describe('nav collapse preference', () => {
  it('round-trips', () => {
    storeNavCollapsed(true);
    expect(readStoredNavCollapsed()).toBe(true);
    storeNavCollapsed(false);
    expect(readStoredNavCollapsed()).toBe(false);
  });

  it('nothing stored reads null', () => {
    expect(readStoredNavCollapsed()).toBeNull();
  });

  it('readStoredNavCollapsed survives a throwing storage', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    installStorage({ getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(readStoredNavCollapsed()).toBeNull();
    expect(() => storeNavCollapsed(true)).not.toThrow();
  });
});
