import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GuideMarkdown } from './guide-markdown';

const none = new Set<string>();

describe('GuideMarkdown', () => {
  it('renders a GFM table', () => {
    const { container } = render(
      <GuideMarkdown body={'| A | B |\n|---|---|\n| 1 | 2 |\n'} hiddenIds={none} />,
    );
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('does not render raw HTML', () => {
    const { container } = render(
      <GuideMarkdown body={'Metin <script>alert(1)</script> <b>kalın</b>\n'} hiddenIds={none} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('gives headings Turkish-aware ids', () => {
    const { container } = render(<GuideMarkdown body={'## Başlık Şimdi\n\n### Alt\n'} hiddenIds={none} />);
    expect(container.querySelector('h2')?.id).toBe('baslik-simdi');
    expect(container.querySelector('h3')?.id).toBe('alt');
  });

  it('renders a link to a hidden topic as plain text', () => {
    const { container } = render(
      <GuideMarkdown
        body={'Bakın: [Marka Alarmları](/rehber/brand-alerts) ve [İlanlar](/rehber/listings#filtreler).\n'}
        hiddenIds={new Set(['brand-alerts'])}
      />,
    );
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/rehber/listings#filtreler']);
    expect(container.textContent).toContain('Marka Alarmları');
  });
});
