'use client';

/**
 * A button that opens an anchored panel — the Takip Edilen Ürünler strip's _Diğer_, _Kayıtlı_
 * and _+ Link ile ekle_ (2026-11-08 seller filters spec §5), which put rarely-used controls one
 * click away so the filter strip stays a single row.
 *
 * Click-outside closes, the same catcher pattern as `ColumnMenu` in `table.tsx`. The panel's
 * content is rendered only while open; a child that needs to close it (after "apply") gets a
 * `close` callback.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, a[href]';
import { buttonClass } from './ui';

export interface PopoverButtonProps {
  /** Button text; also its accessible name. */
  readonly label: string;
  readonly children: ReactNode | ((close: () => void) => ReactNode);
  /** Which edge of the button the panel lines up with. */
  readonly align?: 'left' | 'right';
  readonly variant?: 'primary' | 'secondary';
  /** Width class for the panel. */
  readonly panelClassName?: string;
  readonly title?: string;
}

export function PopoverButton({
  label,
  children,
  align = 'left',
  variant = 'secondary',
  panelClassName = 'w-72',
  title,
}: PopoverButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Closes and returns focus to the trigger, so a keyboard user is not dropped on `<body>`. */
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Keyboard users land inside the panel when it opens (doc 15 §3.7).
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);

  return (
    <div className="relative">
      {/* kit-exempt: popover trigger; Button has no aria-expanded/aria-haspopup props */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((v) => !v)}
        className={buttonClass(variant, 'sm')}
      >
        {label}
      </button>
      {open && (
        <>
          {/* Click-outside catcher, not a real modal backdrop — the panel sits above it. */}
          <div className="fixed inset-0 z-10" onClick={close} />
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                close();
              }
            }}
            className={`absolute z-20 mt-1 rounded-lg border border-(--color-border) bg-(--color-surface) p-3 text-sm shadow-lg ${
              align === 'right' ? 'right-0' : 'left-0'
            } ${panelClassName}`}
          >
            {typeof children === 'function' ? children(close) : children}
          </div>
        </>
      )}
    </div>
  );
}
