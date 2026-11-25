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
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

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
  const [shiftPx, setShiftPx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Closes and returns focus to the trigger, so a keyboard user is not dropped on `<body>`. */
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  /**
   * Keeps the panel inside the content area (review 2026-11-25 Y5). Anchored to one edge of its
   * button, a wide panel near the other edge of a narrow screen opened past it — at 1024px the
   * _+ Link ile ekle_ panel sat 82px off-screen, under the sidebar, and could not be clicked. The
   * boundary is the enclosing `<main>` when there is one (the sidebar is outside it), else the
   * viewport. Measured once per opening; a resize while open is not worth a listener.
   */
  useLayoutEffect(() => {
    if (!open) {
      setShiftPx(0);
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    const margin = 8;
    const main = panel.closest('main');
    const bounds = main
      ? main.getBoundingClientRect()
      : { left: 0, right: typeof window === 'undefined' ? 0 : window.innerWidth };
    const box = panel.getBoundingClientRect();
    if (box.left < bounds.left + margin) setShiftPx(bounds.left + margin - box.left);
    else if (box.right > bounds.right - margin) setShiftPx(bounds.right - margin - box.right);
    else setShiftPx(0);
  }, [open]);

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
            style={shiftPx === 0 ? undefined : { transform: `translateX(${shiftPx}px)` }}
            className={`absolute z-20 mt-1 max-w-[calc(100vw-2rem)] rounded-lg border border-(--color-border) bg-(--color-surface) p-3 text-sm shadow-lg ${
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
