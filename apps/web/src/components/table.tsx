'use client';

import { useMemo, useRef, useState } from 'react';
import { formatNumber } from '@/lib/format';

/**
 * The grid furniture every list screen shares (doc 06 §10, R-UI-5: "Grids are server-paged and
 * virtualised").
 *
 * Two problems are solved here, once, rather than per screen:
 *
 * 1. **A list must fit the screen it is on.** Left to itself a table grows the document until the
 *    filters, the bulk-action bar and the totals row have all scrolled off the top, which is
 *    exactly when the operator needs them. `TableFrame` bounds the grid's height and scrolls it
 *    inside its own box, and the header row stays put while the body moves — a row 40 deep in a
 *    13-column listings grid is unreadable without it.
 * 2. **A long list is paged, not truncated.** Truncation is the dangerous alternative: a screen
 *    that silently shows the first 200 of 2,000 rows reads as exhaustive. `Pagination` always
 *    states the total, so "50 of 2,000" can never be mistaken for "50".
 *
 * `usePagedRows` pages an array already in the browser — right for the report and history
 * screens, whose endpoints aggregate in SQL and return a bounded result. `Pagination` takes a
 * plain state object rather than the hook's return, so a server-paged screen (`/listings`, which
 * pages in the query) drives the identical control from its own `limit`/`offset` state.
 */

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;

export const DEFAULT_PAGE_SIZE = 50;

/**
 * A bounded, scrollable box for a table. `maxHeight` is viewport-relative on purpose: the
 * operator's screen is what the list has to fit, and the same absolute pixel height is a cramped
 * keyhole on a laptop and a wasted third of a desk monitor.
 */
export function TableFrame({
  children,
  maxHeight = '70vh',
  className = '',
}: {
  children: React.ReactNode;
  maxHeight?: string;
  className?: string;
}) {
  return (
    <div
      className={`table-frame rounded border border-(--color-border) ${className}`}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}

/**
 * Class for a `<thead>` inside a {@link TableFrame}: the header row stays visible while the body
 * scrolls under it. The stickiness is applied to the `th` cells rather than the `thead`, because
 * a `border-collapse` table does not honour a sticky `thead` in every browser.
 */
export const STICKY_HEAD = 'table-sticky-head';

export interface PaginationState {
  /** Zero-based. */
  page: number;
  pageSize: number;
  /** Rows across every page — **not** the rows on this one. */
  total: number;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
}

export interface PagedRows<T> extends PaginationState {
  /** The slice to render. */
  rows: T[];
  totalPages: number;
}

/**
 * Pages an array held in the browser.
 *
 * Deliberately does **not** reset to the first page when `rows` changes: the dashboard and the
 * jobs screen re-fetch on a timer, and a reset would yank the operator back to page 1 mid-read
 * every 30 seconds. Screens with filters pass `resetKey` — a string built from the filter values
 * — so a *filter* change starts at page 1 while a *refresh* does not.
 */
export function usePagedRows<T>(
  rows: readonly T[],
  options: { pageSize?: number; resetKey?: string } = {},
): PagedRows<T> {
  const { pageSize: initialPageSize = DEFAULT_PAGE_SIZE, resetKey } = options;
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const lastResetKey = useRef(resetKey);
  if (lastResetKey.current !== resetKey) {
    lastResetKey.current = resetKey;
    if (page !== 0) setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  // Clamped rather than corrected in an effect: when a filter shrinks the result set the row
  // slice has to be right in the *same* render, or the screen flashes an empty page first.
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => rows.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [rows, safePage, pageSize],
  );

  return {
    rows: pageRows,
    page: safePage,
    pageSize,
    total: rows.length,
    totalPages,
    setPage,
    setPageSize,
  };
}

function PageButton({
  label,
  disabled,
  onClick,
  title,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="rounded border border-(--color-border) px-2 py-1 hover:bg-(--color-hover) disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {label}
    </button>
  );
}

/**
 * The pager under a list. A single-page list gets the count only — there is nothing to page
 * through and a dead control beside it is noise. The count itself is never hidden: it is the
 * difference between "these are all of them" and "these are the first 50 of them".
 */
export function Pagination({
  state,
  label,
  children,
}: {
  state: PaginationState;
  /** Turkish noun for what is being counted, e.g. `'ilan'`. */
  label: string;
  /** Extra detail appended to the summary line. */
  children?: React.ReactNode;
}) {
  const { page, pageSize, total, setPage, setPageSize } = state;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-(--color-muted)">
        {total === 0
          ? `${label} yok`
          : `${formatNumber(first)}–${formatNumber(last)} / ${formatNumber(total)} ${label}`}
        {children}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-(--color-muted)">
            Sayfa boyutu
            <select
              value={pageSize}
              onChange={(e) => {
                // Keep the current page's first row in view: asking to see more of the same
                // neighbourhood should not jump somewhere unrelated.
                const nextSize = Number(e.target.value);
                setPage(Math.floor((page * pageSize) / nextSize));
                setPageSize(nextSize);
              }}
              className="rounded border border-(--color-border) px-1 py-0.5"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <PageButton label="«" title="İlk sayfa" disabled={page === 0} onClick={() => setPage(0)} />
          <PageButton label="Önceki" disabled={page === 0} onClick={() => setPage(page - 1)} />
          <span className="text-(--color-muted)">
            {formatNumber(page + 1)} / {formatNumber(totalPages)}
          </span>
          <PageButton
            label="Sonraki"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(page + 1)}
          />
          <PageButton
            label="»"
            title="Son sayfa"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(totalPages - 1)}
          />
        </div>
      )}
    </div>
  );
}
