'use client';

/**
 * A dropdown you can type into to narrow the options — the Takip Edilen Ürünler seller filter
 * (2026-11-08 seller filters spec §5), where a brand can have hundreds of sellers and a plain
 * `<select>` would mean scrolling through all of them.
 *
 * Matching is client-side over the options it is given, Turkish case-insensitive
 * (`toLocaleLowerCase('tr-TR')`: "ipek" finds "İpek", "ılık" finds "Ilık", which a plain
 * `toLowerCase()` gets wrong). Keyboard: ↑/↓ move the highlight, Enter picks it, Esc closes.
 * Click-outside closes, the same catcher pattern as `ColumnMenu` in `table.tsx`.
 */
import { useId, useMemo, useRef, useState } from 'react';

export interface SearchableSelectOption {
  readonly value: string;
  readonly label: string;
  /** Secondary text beside the label (e.g. a product count); searched too. */
  readonly hint?: string;
}

export interface SearchableSelectProps {
  /** Accessible name of the button; the search box is "{label} ara". */
  readonly label: string;
  readonly value: string;
  readonly options: readonly SearchableSelectOption[];
  onChange(value: string): void;
  /** Search box placeholder. */
  readonly placeholder?: string;
  /** Width class for the button, e.g. `w-48`. */
  readonly className?: string;
}

function fold(text: string): string {
  return text.toLocaleLowerCase('tr-TR');
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Yazarak ara…',
  className = 'w-48',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const current = options.find((o) => o.value === value);
  const currentLabel = current?.label ?? 'Tümü';
  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (q === '') return options;
    return options.filter((o) => fold(`${o.label} ${o.hint ?? ''}`).includes(q));
  }, [options, query]);

  /** Closes and puts focus back on the button, so a keyboard user is not dropped on `<body>`. */
  function close() {
    setOpen(false);
    setQuery('');
    setActive(0);
    buttonRef.current?.focus();
  }

  function choose(option: SearchableSelectOption | undefined) {
    if (!option) return;
    onChange(option.value);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  return (
    <div className="relative">
      {/* kit-exempt: combobox trigger; the kit's Select is a native <select> with no search */}
      <button
        ref={buttonRef}
        type="button"
        // Label and choice together: an `aria-label` replaces the visible text, so without the
        // choice a screen reader would never hear which seller is selected.
        aria-label={`${label}: ${currentLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex h-9 items-center justify-between gap-1 rounded-lg border border-(--color-border) bg-(--color-surface) px-3 text-left text-sm ${className}`}
      >
        <span className="truncate">{currentLabel}</span>
        <span aria-hidden className="text-(--color-muted)">
          ▾
        </span>
      </button>
      {open && (
        <>
          {/* Click-outside catcher, not a real modal backdrop — the panel sits above it. */}
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute left-0 z-20 mt-1 w-72 rounded border border-(--color-border) bg-(--color-surface) p-2 shadow-lg">
            <input
              role="combobox"
              aria-label={`${label} ara`}
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
              autoFocus
              value={query}
              placeholder={placeholder}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="mb-1 h-8 w-full rounded border border-(--color-border) bg-(--color-surface) px-2 text-sm outline-none focus:border-(--color-accent)"
            />
            <ul id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto text-sm">
              {matches.length === 0 && <li className="px-2 py-1 text-(--color-muted)">Eşleşen yok</li>}
              {matches.map((o, i) => (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={`flex cursor-pointer items-baseline justify-between gap-2 rounded px-2 py-1 ${
                    i === active ? 'bg-(--color-hover)' : ''
                  } ${o.value === value ? 'font-medium' : ''}`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-(--color-muted)">{o.hint}</span>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
