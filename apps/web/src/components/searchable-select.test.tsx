import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchableSelect } from './searchable-select';

/**
 * The type-to-filter dropdown (2026-11-08 seller filters spec §5: the Satıcı filter). Matching is
 * Turkish case-insensitive — "ipek" finds "İpek", "ılık" finds "Ilık" — which a plain
 * `toLowerCase()` gets wrong for both.
 */

afterEach(() => cleanup());

const OPTIONS = [
  { value: '', label: 'Tümü' },
  { value: 'TY:S1', label: 'İpek Mağaza', hint: '12 ürün' },
  { value: 'TY:S2', label: 'Ilık Market', hint: '3 ürün' },
];

function open(onChange = vi.fn()) {
  render(<SearchableSelect label="Satıcı" value="" options={OPTIONS} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /^Satıcı/ }));
  return { onChange, input: screen.getByRole('combobox', { name: 'Satıcı ara' }) };
}

function optionLabels(): string[] {
  return screen.getAllByRole('option').map((o) => o.textContent ?? '');
}

describe('SearchableSelect', () => {
  it('shows the current option on the button', () => {
    render(<SearchableSelect label="Satıcı" value="TY:S2" options={OPTIONS} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^Satıcı/ }).textContent).toContain('Ilık Market');
  });

  it('filters options by typed text, Turkish case-insensitively', () => {
    const { input } = open();

    fireEvent.change(input, { target: { value: 'ipek' } });
    expect(optionLabels()).toEqual(['İpek Mağaza12 ürün']);

    fireEvent.change(input, { target: { value: 'ılık' } });
    expect(optionLabels()).toEqual(['Ilık Market3 ürün']);
  });

  it('selects the highlighted option with Enter and closes', () => {
    const { input, onChange } = open();

    fireEvent.change(input, { target: { value: 'market' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('TY:S2');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('moves the highlight with the arrow keys', () => {
    const { input, onChange } = open();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('TY:S1');
  });

  it('closes on Escape without choosing', () => {
    const { input, onChange } = open();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('selects an option by click', () => {
    const { onChange } = open();

    fireEvent.click(screen.getByRole('option', { name: /İpek Mağaza/ }));

    expect(onChange).toHaveBeenCalledWith('TY:S1');
  });
});

describe('SearchableSelect keyboard and naming', () => {
  it('names the button with the label and the current choice', () => {
    render(<SearchableSelect label="Satıcı" value="TY:S2" options={OPTIONS} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Satıcı: Ilık Market' })).toBeTruthy();
  });

  it('returns focus to the button after Escape', () => {
    const { input } = open();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Satıcı/ }));
  });
});
