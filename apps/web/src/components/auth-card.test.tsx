import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthCard } from './auth-card';

/**
 * The sign-in screens' frame (doc 06 §10.1), restyled in the redesign's phase 3 (plan
 * `2026-11-03-ui-redesign-phase-3-rest.md`, Task 11): the screen's title stays its only `<h1>`,
 * and the new brand mark is decoration a screen reader skips.
 */

afterEach(() => cleanup());

describe('AuthCard', () => {
  it('renders the title as the page heading', () => {
    render(<AuthCard title="Giriş yap">form</AuthCard>);

    expect(screen.getByRole('heading', { level: 1, name: 'Giriş yap' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('brand mark is decorative', () => {
    const { container } = render(<AuthCard title="Giriş yap">form</AuthCard>);

    const mark = container.querySelector('[data-testid="auth-brand"] svg');
    expect(mark).toBeTruthy();
    expect(mark!.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('BuyBoxApp')).toBeTruthy();
  });
});
