import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileInput } from './file-input';

afterEach(() => cleanup());

// Review 2026-11-25: the native picker said "Choose file / No file chosen" on Turkish screens.
describe('FileInput', () => {
  it('speaks Turkish, names the chosen file and still hands the change to its owner', () => {
    const onChange = vi.fn();
    render(<FileInput aria-label="Excel dosyası" onChange={onChange} />);
    expect(screen.getByText('Dosya seç')).toBeTruthy();
    expect(screen.getByText('Dosya seçilmedi')).toBeTruthy();
    const input = screen.getByLabelText('Excel dosyası');
    const file = new File(['a;b'], 'fiyatlar.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('fiyatlar.csv')).toBeTruthy();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
