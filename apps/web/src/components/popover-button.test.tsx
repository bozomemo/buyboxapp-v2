import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PopoverButton } from './popover-button';

/** Keyboard users must be able to leave the panel (doc 15 §3.7 accessibility floor). */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function rect(left: number, width: number): DOMRect {
  return { left, right: left + width, width, top: 0, bottom: 100, height: 100, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
}

describe('PopoverButton', () => {
  it('opens on click and closes on Escape, focus back on the button', () => {
    render(
      <PopoverButton label="Diğer">
        <input type="checkbox" aria-label="Bir seçenek" />
      </PopoverButton>,
    );
    const trigger = screen.getByRole('button', { name: 'Diğer' });
    fireEvent.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Diğer' });
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Bir seçenek' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(panel.isConnected).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('moves focus into the panel when it opens', () => {
    render(
      <PopoverButton label="Kayıtlı">
        <button type="button">Eski</button>
      </PopoverButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kayıtlı' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Eski' }));
  });

  // Review 2026-11-25 Y5: at 1024px a right-aligned panel opened 82px past the left edge, under
  // the sidebar, where its field and button could not be clicked.
  it('shifts a panel that would open past the left edge of the content area back inside it', () => {
    render(
      <main>
        <PopoverButton label="+ Link ile ekle" align="right">
          <input aria-label="Ürün linki" />
        </PopoverButton>
      </main>,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'MAIN') return rect(240, 784);
      if (this.getAttribute('role') === 'dialog') return rect(-82, 448);
      return rect(0, 0);
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Link ile ekle' }));
    const panel = screen.getByRole('dialog', { name: '+ Link ile ekle' });
    // 240 + 8 margin − (−82) = 330px to the right.
    expect(panel.style.transform).toBe('translateX(330px)');
  });

  it('shifts a panel that would open past the right edge back to the left', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    render(
      <PopoverButton label="Kayıtlı">
        <button type="button">Eski</button>
      </PopoverButton>,
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'dialog') return rect(900, 288);
      return rect(0, 0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kayıtlı' }));
    // 1024 − 8 − 1188 = −172px.
    expect(screen.getByRole('dialog', { name: 'Kayıtlı' }).style.transform).toBe('translateX(-172px)');
  });
});
