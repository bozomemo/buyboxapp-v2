import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon, Package } from './icon';

afterEach(cleanup);

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('Icon', () => {
  it('decorative by default', () => {
    const { container } = render(<Icon icon={Package} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('stroke-width')).toBe('1.8');
  });

  it('labelled', () => {
    render(<Icon icon={Package} label="Stok" />);
    expect(screen.getByRole('img', { name: 'Stok' })).toBeTruthy();
  });

  it('only import point', () => {
    const offenders = sources(SRC)
      .filter((file) => !file.endsWith(path.join('components', 'icon.tsx')) && !file.endsWith('.test.tsx'))
      .filter((file) => readFileSync(file, 'utf8').includes("from 'lucide-react'"))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
