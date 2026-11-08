import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PopoverButton } from './popover-button';

/** Keyboard users must be able to leave the panel (doc 15 §3.7 accessibility floor). */

afterEach(() => cleanup());

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
});
