import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TableFrame } from './table';

afterEach(cleanup);

describe('TableFrame', () => {
  it('is a card', () => {
    const { container } = render(
      <TableFrame>
        <table />
      </TableFrame>,
    );
    const frame = container.firstElementChild;
    expect(frame?.className).toContain('table-frame');
    expect(frame?.className).toContain('rounded-xl');
    expect(frame?.className).toContain('bg-(--color-surface)');
    expect(frame?.className).toContain('shadow-(--shadow-card)');
  });
});
