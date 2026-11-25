import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import NotFound from './not-found';

afterEach(() => cleanup());

// Review 2026-11-25: the 404 was Next's English default, outside the app's theme.
describe('NotFound', () => {
  it('says so in Turkish and offers the way back', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Panele dön' }).getAttribute('href')).toBe('/');
  });
});
