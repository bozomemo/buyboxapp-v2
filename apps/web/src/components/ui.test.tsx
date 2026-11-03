import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Search, Trash2 } from './icon';
import { Button, Chip, ErrorState, PageHeader, Section, TextInput, type Tone } from './ui';

/**
 * Kit tests for the 2026-11-03 visual redesign (spec §4). They pin what a screen relies on — the
 * accessible name, the word next to a colour, the opt-in card — not the exact class strings, so a
 * later restyle does not have to rewrite them.
 */
afterEach(cleanup);

describe('Button', () => {
  it('variants', () => {
    render(
      <>
        <Button variant="danger">Sil</Button>
        <Button variant="ghost">Vazgeç</Button>
        <Button size="sm">Küçük</Button>
        <Button>Büyük</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Sil' }).className).toContain('--color-danger');
    expect(screen.getByRole('button', { name: 'Vazgeç' }).className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(screen.getByRole('button', { name: 'Küçük' }).className).toContain('h-8');
    expect(screen.getByRole('button', { name: 'Büyük' }).className).toContain('h-9');
  });

  it('icon-only button needs a label', () => {
    render(<Button icon={Trash2} aria-label="Sil" />);
    const button = screen.getByRole('button', { name: 'Sil' });
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('rejects an icon-only button without a label at compile time', () => {
    // @ts-expect-error — an icon-only button must carry aria-label.
    const element = <Button icon={Trash2} />;
    expect(element).toBeTruthy();
  });
});

describe('Chip', () => {
  it.each<Tone>(['ok', 'warn', 'danger', 'neutral'])('keeps its word with tone %s', (tone) => {
    const { container } = render(
      <Chip tone={tone} dot>
        Uyumlu
      </Chip>,
    );
    expect(screen.getByText('Uyumlu')).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('Section', () => {
  it('card is opt-in', () => {
    const { container, rerender } = render(
      <Section id="s1" title="Pazaryerleri">
        x
      </Section>,
    );
    const plain = container.querySelector('section');
    expect(plain?.className ?? '').not.toContain('--shadow-card');
    expect(plain?.getAttribute('aria-labelledby')).toBe('s1');
    expect(container.querySelector('#s1')?.textContent).toBe('Pazaryerleri');

    rerender(
      <Section id="s1" title="Pazaryerleri" card>
        x
      </Section>,
    );
    expect(container.querySelector('section')?.className).toContain('--shadow-card');
  });
});

describe('PageHeader', () => {
  it('renders a breadcrumb', () => {
    render(
      <PageHeader
        title="Takip Edilen Ürünler"
        breadcrumb={[{ label: 'Marka Denetimi', href: '/' }, { label: 'Takip Edilen Ürünler' }]}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Konum' });
    expect(within(nav).getByRole('link', { name: 'Marka Denetimi' })).toBeTruthy();
    expect(within(nav).getByText('Takip Edilen Ürünler').getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 1, name: 'Takip Edilen Ürünler' })).toBeTruthy();
  });
});

describe('TextInput', () => {
  it('icon', () => {
    const { container } = render(<TextInput icon={Search} aria-label="Ara" />);
    expect(screen.getByRole('textbox', { name: 'Ara' })).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('ErrorState', () => {
  it('retry', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="HTTP 500" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
