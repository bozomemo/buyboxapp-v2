import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubFetch } from '@/test-utils';
import { SweepPassCard } from './sweep-pass-card';

/**
 * The sweep pass card and its compact chip (2026-11-08 seller filters spec §5 item 3): on
 * `/tracked-products` the pass sits in the summary line as a chip, with the card's details in its
 * tooltip; `/jobs` keeps the full card.
 */

afterEach(() => cleanup());

const PASS = {
  current: {
    passNo: 1089,
    startedAt: Date.UTC(2026, 10, 8, 6, 0),
    finishedAt: null,
    plannedCount: 1000,
    doneCount: 350,
    failedCount: 0,
    estimatedFinishAtMs: null,
  },
  previous: [{ passNo: 1088, doneCount: 990, durationMs: 3 * 60 * 60_000 }],
};

describe('SweepPassCard', () => {
  it('chip: shows the pass and its percentage inline, details only in the tooltip', async () => {
    stubFetch({ '/api/tracked-products/sweep-pass': { body: PASS } });

    render(<SweepPassCard marketplaceCode="trendyol" scope="all" label="Tarama turu" variant="chip" />);

    const chip = await screen.findByTestId('sweep-pass-chip');
    expect(chip.textContent).toContain('Tarama turu #1089');
    expect(chip.textContent).toContain('%35');
    expect(chip.textContent).not.toContain('Önceki tur');
    expect(chip.getAttribute('title')).toContain('Önceki tur');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('35');
  });

  it('card: the default rendering keeps the previous pass on screen', async () => {
    stubFetch({ '/api/tracked-products/sweep-pass': { body: PASS } });

    render(<SweepPassCard marketplaceCode="trendyol" scope="all" label="Tarama turu" />);

    expect(await screen.findByText(/Önceki tur/)).toBeTruthy();
    expect(screen.queryByTestId('sweep-pass-chip')).toBeNull();
  });
});
