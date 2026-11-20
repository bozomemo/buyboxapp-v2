import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BandRealismNote } from './band-realism-note';

/** Brand roadmap §6.12: the note appears only when the market sat on one side of the band. */
afterEach(() => cleanup());

describe('BandRealismNote', () => {
  it('every look above the band: names the median', () => {
    render(<BandRealismNote realism={{ kind: 'allAbove', looks: 42, medianUnitPrice: '13000', windowDays: 30 }} />);
    expect(screen.getByText('Bant piyasadan uzak olabilir')).toBeTruthy();
    expect(screen.getByText(/üst sınırın üstünde/)).toBeTruthy();
    expect(screen.getByText(/130,00/)).toBeTruthy();
  });

  it('every look below the min', () => {
    render(<BandRealismNote realism={{ kind: 'allBelow', looks: 12, medianUnitPrice: '6000', windowDays: 30 }} />);
    expect(screen.getByText(/Min'in altında/)).toBeTruthy();
  });

  it.each(['consistent', 'insufficient'] as const)('%s: says nothing', (kind) => {
    const { container } = render(
      <BandRealismNote realism={{ kind, looks: 3, medianUnitPrice: '10000', windowDays: 30 }} />,
    );
    expect(container.textContent).toBe('');
  });
});
