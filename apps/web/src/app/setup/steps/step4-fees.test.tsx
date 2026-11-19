import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { Step4Fees } from './step4-fees';

/**
 * The fee bands are typed the way the screens show money. "39,99" was refused with "Geçerli bir
 * tutar olmalı (örn. 11.00)" (2026-11-19 walkthrough), and the floor preview mixed "100,00 ₺"
 * with the server's "₺170,58" in one sentence.
 */
afterEach(() => cleanup());

function amountInput(): HTMLInputElement {
  return screen.getAllByPlaceholderText('Tutar')[0] as HTMLInputElement;
}

describe('Step4Fees', () => {
  it('accepts a comma decimal in a band amount', () => {
    render(<Step4Fees enabledMarketplaces={['trendyol']} onDone={() => {}} onBack={() => {}} />);
    fireEvent.change(amountInput(), { target: { value: '39,99' } });
    fireEvent.blur(amountInput());
    expect(screen.queryByText(/Geçerli bir tutar olmalı/)).toBeNull();
  });

  it('still refuses text that is not an amount', () => {
    render(<Step4Fees enabledMarketplaces={['trendyol']} onDone={() => {}} onBack={() => {}} />);
    fireEvent.change(amountInput(), { target: { value: '400,505' } });
    fireEvent.blur(amountInput());
    expect(screen.getByText(/Geçerli bir tutar olmalı/)).toBeTruthy();
  });

  it('writes the sample cost in the same money format as the floor it shows', async () => {
    stubFetch({ '/api/setup/fees/preview': { body: { ok: true, floorPrice: '₺170,58' } } });
    render(<Step4Fees enabledMarketplaces={['trendyol']} onDone={() => {}} onBack={() => {}} />);
    screen.getByRole('button', { name: 'Dip Fiyat Önizle' }).click();
    expect(await screen.findByText('₺100,00 maliyetli bir ürün için dip fiyat: ₺170,58')).toBeTruthy();
  });
});

describe('Step4Fees money format', () => {
  /** One TL reading app-wide (product owner, 2026-11-19): "1.400" is 1 400 ₺, prefills read "11,00". */
  it('accepts a grouped amount and prefills the Turkish way', () => {
    render(<Step4Fees enabledMarketplaces={['trendyol']} onDone={() => {}} onBack={() => {}} />);
    expect(amountInput().value).toBe('11,00');
    fireEvent.change(amountInput(), { target: { value: '1.400' } });
    fireEvent.blur(amountInput());
    expect(screen.queryByText(/Geçerli bir tutar olmalı/)).toBeNull();
  });
});
