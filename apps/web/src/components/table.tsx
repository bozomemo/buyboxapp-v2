'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Add/remove, reorder and resize columns, remembered per browser (doc 06 §4.1, customer
 * feedback 2026-08-25: "sütunlar eklenip/kaldırılabilir, resize edilebilir olacak... aynı
 * görünüm korunmalı"). `Listings` is the reference implementation; roll this same hook out to
 * the other grids rather than inventing a second column-prefs shape per screen.
 *
 * Mirrors `ThemeToggle`'s localStorage pattern (`app/theme-toggle.tsx`): the initializer returns
 * `defs` unchanged so server and first-client render match, and the stored preference — if any —
 * is applied in an effect right after mount. A stored preference naming a column `defs` no
 * longer has (an old build, a renamed column) is silently dropped rather than crashing or
 * resurrecting a ghost column; a `defs` column missing from a *valid* stored list (a newly added
 * column) is appended visible, so a shipped column is never invisible by default.
 */
export interface ColumnDef<K extends string> {
  readonly id: K;
  readonly label: string;
  /** Starting width in pixels. Omit for a column that should size itself (e.g. a checkbox). */
  readonly defaultWidth?: number;
  /** Hidden by default until the operator opts in — for a column most screens don't need open. */
  readonly hiddenByDefault?: boolean;
}

interface StoredColumnPrefs {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
}

function readColumnPrefs(storageKey: string): StoredColumnPrefs | undefined {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredColumnPrefs>;
    if (!Array.isArray(parsed.order)) return undefined;
    return { order: parsed.order, hidden: parsed.hidden ?? [], widths: parsed.widths ?? {} };
  } catch {
    return undefined; // storage unavailable or the stored JSON is corrupt — fall back to defaults
  }
}

export interface ColumnPrefs<K extends string> {
  /** Every column id, visible and hidden, in display order. */
  order: readonly K[];
  isVisible: (id: K) => boolean;
  widthOf: (id: K) => number | undefined;
  toggleVisible: (id: K) => void;
  move: (id: K, direction: -1 | 1) => void;
  setWidth: (id: K, px: number) => void;
  resetToDefault: () => void;
}

export function useColumnPrefs<K extends string>(
  storageKey: string,
  defs: readonly ColumnDef<K>[],
): ColumnPrefs<K> {
  const defaultOrder = useMemo(() => defs.map((d) => d.id), [defs]);
  const defaultHidden = useMemo(
    () => new Set(defs.filter((d) => d.hiddenByDefault).map((d) => d.id)),
    [defs],
  );
  const defaultWidths = useMemo(() => {
    const w: Partial<Record<K, number>> = {};
    for (const d of defs) if (d.defaultWidth !== undefined) w[d.id] = d.defaultWidth;
    return w;
  }, [defs]);

  const [order, setOrder] = useState<K[]>(defaultOrder);
  const [hidden, setHidden] = useState<Set<K>>(defaultHidden);
  const [widths, setWidths] = useState<Partial<Record<K, number>>>(defaultWidths);

  useEffect(() => {
    const stored = readColumnPrefs(storageKey);
    if (!stored) return;
    const known = new Set(defaultOrder);
    // Known columns in the stored order first, then any column `defs` has gained since —
    // visible, appended at the end, per the doc comment above.
    const storedKnown = stored.order.filter((id): id is K => known.has(id as K));
    const gained = defaultOrder.filter((id) => !storedKnown.includes(id));
    setOrder([...storedKnown, ...gained]);
    setHidden(new Set(stored.hidden.filter((id): id is K => known.has(id as K))));
    const restoredWidths: Partial<Record<K, number>> = { ...defaultWidths };
    for (const [id, px] of Object.entries(stored.widths)) {
      if (known.has(id as K) && typeof px === 'number') restoredWidths[id as K] = px;
    }
    setWidths(restoredWidths);
    // Deliberately runs once per mount (storageKey/defaultOrder are stable for a given screen) —
    // re-running on every `defs` identity change would fight the operator's own edits below.
    // (No `exhaustive-deps` disable directive: this repo's eslint config carries no react-hooks
    // plugin, so naming that rule is itself an error — see `eslint.config.js`.)
  }, [storageKey]);

  function persist(next: { order: K[]; hidden: Set<K>; widths: Partial<Record<K, number>> }) {
    try {
      const toStore: StoredColumnPrefs = {
        order: next.order,
        hidden: [...next.hidden],
        widths: next.widths as Record<string, number>,
      };
      window.localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch {
      // Storage unavailable: the in-memory state above still applies for this page load.
    }
  }

  return {
    order,
    isVisible: (id) => !hidden.has(id),
    widthOf: (id) => widths[id],
    toggleVisible: (id) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist({ order, hidden: next, widths });
        return next;
      });
    },
    move: (id, direction) => {
      setOrder((prev) => {
        const i = prev.indexOf(id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[j]] = [next[j]!, next[i]!];
        persist({ order: next, hidden, widths });
        return next;
      });
    },
    setWidth: (id, px) => {
      setWidths((prev) => {
        const next = { ...prev, [id]: Math.max(40, Math.round(px)) };
        persist({ order, hidden, widths: next });
        return next;
      });
    },
    resetToDefault: () => {
      setOrder(defaultOrder);
      setHidden(defaultHidden);
      setWidths(defaultWidths);
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Storage unavailable — the in-memory reset above still applies for this page load.
      }
    },
  };
}

/**
 * The "Sütunlar" popover: check to show/hide, ↑/↓ to reorder. Buttons rather than drag-and-drop
 * — a pointer-drag reorder needs its own hit-testing and drop-indicator work that buys little
 * over two clicks for a column list this short, and buttons keep the control keyboard-operable
 * for free.
 */
export function ColumnMenu<K extends string>({
  defs,
  prefs,
}: {
  defs: readonly ColumnDef<K>[];
  prefs: ColumnPrefs<K>;
}) {
  const [open, setOpen] = useState(false);
  const labelOf = useMemo(() => new Map(defs.map((d) => [d.id, d.label])), [defs]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-(--color-border) px-2 py-1 text-xs hover:bg-(--color-hover)"
      >
        Sütunlar
      </button>
      {open && (
        <>
          {/* Click-outside catcher, not a real modal backdrop — the menu itself sits above it. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-(--color-border) bg-(--color-surface) p-2 shadow-lg">
            <ul className="max-h-80 space-y-0.5 overflow-y-auto text-xs">
              {prefs.order.map((id, i) => (
                <li key={id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={prefs.isVisible(id)}
                    onChange={() => prefs.toggleVisible(id)}
                  />
                  <span className="flex-1 truncate">{labelOf.get(id) ?? id}</span>
                  <button
                    type="button"
                    title="Yukarı taşı"
                    disabled={i === 0}
                    onClick={() => prefs.move(id, -1)}
                    className="px-1 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="Aşağı taşı"
                    disabled={i === prefs.order.length - 1}
                    onClick={() => prefs.move(id, 1)}
                    className="px-1 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => prefs.resetToDefault()}
              className="mt-2 w-full rounded border border-(--color-border) px-2 py-1 text-(--color-muted) hover:bg-(--color-hover)"
            >
              Varsayılana dön
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The `<table>` style a resizable grid needs.
 *
 * `auto` layout — the default — treats a `th` width as a *suggestion*: on a `w-full` table the
 * browser must still fill 100%, so shrinking one column silently hands the pixels to its
 * neighbours and the column the operator grabbed barely moves (it looks like the content slid
 * sideways rather than the column narrowing). `fixed` layout honours the widths literally, which
 * only works once the table is as wide as the columns say — hence the explicit total. The frame
 * around it already scrolls (`.table-frame { overflow: auto }`), so a table wider than the screen
 * scrolls horizontally instead of squeezing every column.
 *
 * `extraPx` covers un-resizable leading cells a screen renders itself, e.g. the listings grid's
 * select-all checkbox column.
 */
export function resizableTableStyle<K extends string>(
  defs: readonly ColumnDef<K>[],
  prefs: ColumnPrefs<K>,
  extraPx = 0,
): React.CSSProperties {
  const total = defs
    .filter((d) => prefs.isVisible(d.id))
    .reduce((sum, d) => sum + (prefs.widthOf(d.id) ?? d.defaultWidth ?? 120), extraPx);
  return { tableLayout: 'fixed', width: total, minWidth: '100%' };
}

/**
 * A `<th>` that drags its right edge to resize and remembers the result via `prefs`. Pair it with
 * {@link resizableTableStyle} on the `<table>` — the widths written here are only obeyed under
 * `table-layout: fixed`.
 *
 * The grip is drawn as a permanent hairline rather than appearing on hover: an invisible control
 * is one nobody discovers, and hunting for a 6px strip that gives no sign it is there reads as
 * "resizing is broken". It brightens to the accent colour while hovered or dragged. The hit area
 * is wider than the line and straddles the border so the pointer does not have to be pixel-exact.
 */
export function ResizableTh<K extends string>({
  id,
  prefs,
  children,
  className = '',
}: {
  id: K;
  prefs: ColumnPrefs<K>;
  children: React.ReactNode;
  className?: string;
}) {
  const thRef = useRef<HTMLTableCellElement>(null);
  const [dragging, setDragging] = useState(false);
  const width = prefs.widthOf(id);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation(); // never let the grab also fire the header's sort toggle
    const startX = e.clientX;
    const startWidth = thRef.current?.getBoundingClientRect().width ?? 100;
    setDragging(true);
    // Without this the drag selects the header text of every column it passes over.
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    function onMove(ev: MouseEvent) {
      prefs.setWidth(id, startWidth + (ev.clientX - startX));
    }
    function onUp() {
      setDragging(false);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <th
      ref={thRef}
      className={`relative ${className}`}
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
    >
      {children}
      <span
        onMouseDown={startResize}
        onDoubleClick={() => prefs.setWidth(id, 120)}
        title="Sürükleyerek sütun genişliğini değiştirin"
        className="group absolute -right-1 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none select-none items-stretch justify-center"
      >
        <span
          className={`w-px transition-colors ${
            dragging ? 'bg-(--color-accent)' : 'bg-(--color-border) group-hover:bg-(--color-accent)'
          }`}
        />
      </span>
    </th>
  );
}
