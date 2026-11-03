import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Search, Trash2 } from './icon';
import {
  Button,
  buttonClass,
  Chip,
  ErrorState,
  PageHeader,
  Section,
  SegmentedFilter,
  StatCard,
  TextInput,
  VerdictBanner,
  type Tone,
} from './ui';

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

  // Phase 3 final review: a `flex-none` action box takes its max-content width and can never
  // shrink, so a `flex-wrap` row of filters inside it overflows a narrow screen instead of wrapping.
  it('action can shrink so its own row wraps', () => {
    render(<PageHeader title="Rakip Satıcılar" action={<div data-testid="filters">x</div>} />);
    const box = screen.getByTestId('filters').parentElement!;
    expect(box.className).not.toContain('flex-none');
    expect(box.className).toContain('max-w-full');
    expect(box.className).toContain('min-w-0');
  });
});

describe('TextInput', () => {
  it('icon', () => {
    const { container } = render(<TextInput icon={Search} aria-label="Ara" />);
    expect(screen.getByRole('textbox', { name: 'Ara' })).toBeTruthy();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  // Phase 3 final review: with an icon the input sits in a shrink-to-fit wrapper, so a width on
  // the input alone (`w-full`) resolved against the wrapper and collapsed to the default width.
  it.each(['w-full', 'w-56'])('icon input takes its width (%s) from the wrapper', (width) => {
    render(<TextInput icon={Search} aria-label="Ara" className={`mt-2 ${width}`} />);
    const input = screen.getByRole('textbox', { name: 'Ara' });
    const wrapper = input.parentElement!;
    expect(wrapper.className).toContain(width);
    expect(input.className).toContain('w-full');
    // Non-width classes stay on the input.
    expect(input.className).toContain('mt-2');
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

describe('StatCard', () => {
  it('renders label, value and delta', () => {
    render(<StatCard label="Açık bulgu" value="14" delta="↑ 6 · geçen hafta 8" tone="danger" />);
    expect(screen.getByText('Açık bulgu')).toBeTruthy();
    expect(screen.getByText('↑ 6 · geçen hafta 8')).toBeTruthy();
    const value = screen.getByText('14');
    expect(value.className).toContain('--color-danger');
    expect(value.className).toContain('tabular-figures');
  });
});

describe('SegmentedFilter', () => {
  it('is a labelled group of pressed buttons', () => {
    const onChange = vi.fn();
    render(
      <SegmentedFilter
        label="Durum"
        value="all"
        onChange={onChange}
        options={[
          { value: 'all', label: 'Tümü', count: 128 },
          { value: 'bad', label: 'Tavsiye altı', count: 14, tone: 'danger' },
          { value: 'warn', label: 'Sınırda', count: 9, tone: 'warn' },
        ]}
      />,
    );
    const group = screen.getByRole('group', { name: 'Durum' });
    expect(within(group).getByRole('button', { name: /Tümü/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: /Tavsiye altı/ }).getAttribute('aria-pressed')).toBe('false');
    expect(within(group).getByText('14')).toBeTruthy();
    fireEvent.click(within(group).getByRole('button', { name: /Sınırda/ }));
    expect(onChange).toHaveBeenCalledWith('warn');
  });
});

describe('VerdictBanner', () => {
  it('announces its title', () => {
    render(<VerdictBanner tone="warn" title="Sistem ilerliyor, 2 konu ilginizi bekliyor" />);
    const title = within(screen.getByRole('status')).getByText('Sistem ilerliyor, 2 konu ilginizi bekliyor');
    expect(title.className).toContain('--color-warning-strong');
  });
});

describe('buttonClass', () => {
  it('matches Button', () => {
    render(
      <Button variant="danger" size="sm">
        X
      </Button>,
    );
    const className = screen.getByRole('button', { name: 'X' }).className;
    for (const token of buttonClass('danger', 'sm').split(/\s+/).filter(Boolean)) expect(className).toContain(token);
  });
});

describe('VerdictBanner level and children', () => {
  it('can be the page h1 and carries a chip row', () => {
    render(
      <VerdictBanner tone="ok" title="Her şey yolunda" level={1}>
        <Chip tone="ok">İşler: çalışıyor</Chip>
      </VerdictBanner>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Her şey yolunda' })).toBeTruthy();
    expect(within(screen.getByRole('status')).getByText('İşler: çalışıyor')).toBeTruthy();
  });
});

describe('VerdictBanner neutral', () => {
  it('a neutral headline reads in body ink, not muted', () => {
    render(<VerdictBanner tone="neutral" title="Sistem duraklatıldı" />);
    expect(screen.getByRole('heading', { name: 'Sistem duraklatıldı' }).className).toContain('--color-text');
  });
});

// Redesign follow-ups (deferred minors of phases 1–3).
describe('Button follow-ups', () => {
  it('ghost-danger keeps danger ink without a fill or border', () => {
    render(<Button variant="ghost-danger">Kaldır</Button>);
    const className = screen.getByRole('button', { name: 'Kaldır' }).className;
    expect(className).toContain('text-(--color-danger)');
    expect(className).not.toContain('bg-(--color-danger)');
    expect(className).not.toMatch(/(^|\s)border(\s|$)/);
  });

  it('icon-only button is square: no size padding to override', () => {
    render(<Button icon={Trash2} size="sm" aria-label="Sil" />);
    const className = screen.getByRole('button', { name: 'Sil' }).className;
    expect(className).toContain('w-8');
    expect(className).not.toContain('px-3');
  });
});

describe('VerdictBanner action', () => {
  // The banner is a live region; a refresh button and a clock in it re-announced the whole
  // verdict every time the clock moved.
  it('is outside the announcement', () => {
    render(<VerdictBanner tone="ok" title="Her şey yolunda" action={<span>Son güncelleme 10:00</span>} />);
    expect(screen.getByText('Son güncelleme 10:00').closest('[aria-live="off"]')).toBeTruthy();
  });
});

describe('ErrorState title and retrying', () => {
  it('names what failed and holds the button while retrying', () => {
    render(<ErrorState title="Panel verisi yüklenemedi" message="HTTP 500" onRetry={() => {}} retrying />);
    expect(screen.getByText('Panel verisi yüklenemedi')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Deneniyor…' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
