import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GuideClient, type GuideListItem } from './guide-client';

afterEach(() => cleanup());

const TOPICS: GuideListItem[] = [
  {
    id: 'watched-brands',
    title: 'İzlenen Markalar',
    section: 'screens',
    headings: [],
    body: 'Marka ekleme ekranı. **Kaldır** markayı listeden çıkarır. Başka bir cümle.',
  },
];

// Review 2026-11-25: search results showed titles only.
describe('GuideClient', () => {
  it('shows the sentence a search matched under the result', () => {
    render(<GuideClient topics={TOPICS} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rehberde ara' }), { target: { value: 'listeden' } });
    expect(screen.getByRole('link', { name: 'İzlenen Markalar' })).toBeTruthy();
    expect(screen.getByText('Kaldır markayı listeden çıkarır.')).toBeTruthy();
  });
});
