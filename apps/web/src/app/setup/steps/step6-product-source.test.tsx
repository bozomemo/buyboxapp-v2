import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { Step6ProductSource } from './step6-product-source';

afterEach(() => cleanup());

describe('Step6ProductSource', () => {
  /** The column fields were labelled with the internal keys, "baseStockCode sütun başlığı" (2026-11-19). */
  it('labels the Excel column fields in Turkish', async () => {
    stubFetch({ '/api/product-source/config': { body: { configured: false } } });
    render(<Step6ProductSource onDone={() => {}} onBack={() => {}} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'excel' } });

    expect(await screen.findByText('Stok kodu sütunu')).toBeTruthy();
    expect(screen.getByText('Stok miktarı sütunu')).toBeTruthy();
    expect(screen.queryByText(/baseStockCode|unitCost|unitStock/)).toBeNull();
  });
});
