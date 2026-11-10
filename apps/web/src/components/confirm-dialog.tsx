'use client';

/**
 * The in-app replacement for the browser's `window.confirm` and `window.alert` (2026-11-10, owner:
 * "no browser popup anywhere in the app"). A native popup cannot be styled, blocks the whole tab,
 * looks like a different product on every browser, and some embedded browsers suppress it
 * entirely — the self-update screen's "Şimdi kur" did nothing in one because `confirm()` silently
 * returned `false`.
 *
 * Two shapes:
 * - `ConfirmDialog` — the presentational modal, controlled by its caller.
 * - `useConfirm()` — an imperative `await ask({...})` / `await notify({...})` for code paths
 *   that only know the message after a request has run. The caller renders the returned `dialog`
 *   node once, anywhere in its tree.
 *
 * The dialog is portalled to `<body>` so a table cell's `overflow` or a sticky header's stacking
 * context cannot clip it. Focus moves into the dialog (to the safe choice, "Vazgeç", when there is
 * one), Tab stays inside it, Escape and a backdrop click cancel, and focus returns to whatever had
 * it before — the same keyboard contract as `PopoverButton` (doc 15 §3.7).
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Icon, Info } from './icon';
import { Button } from './ui';

export type ConfirmTone = 'primary' | 'danger';

export interface ConfirmOptions {
  /** What is about to happen, in the operator's words. `\n` breaks are kept. */
  readonly message: ReactNode;
  readonly title?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** `danger` for an action that removes or stops something. */
  readonly tone?: ConfirmTone;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  readonly open: boolean;
  /** A notice: one button, no cancel. */
  readonly notice?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

const DEFAULT_TITLE = 'Onay gerekli';
const DEFAULT_NOTICE_TITLE = 'Bilgi';

export function ConfirmDialog({
  open,
  notice = false,
  message,
  title,
  confirmLabel,
  cancelLabel = 'Vazgeç',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus in on open, back out on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    (notice ? confirmRef : cancelRef).current?.focus();
    return () => previous?.focus?.();
  }, [open, notice]);

  if (!open || typeof document === 'undefined') return null;

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === 'Tab') {
      const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button') ?? []);
      if (buttons.length === 0) return;
      const first = buttons[0]!;
      const last = buttons[buttons.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  const danger = tone === 'danger';
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] motion-safe:animate-[dialog-fade_120ms_ease-out]"
        aria-hidden="true"
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        role={notice ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative w-full max-w-md rounded-xl border border-(--color-border) bg-(--color-surface) p-5 text-(--color-text) shadow-xl motion-safe:animate-[dialog-pop_140ms_ease-out]"
      >
        <div className="flex gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              danger ? 'bg-(--color-danger-bg) text-(--color-danger)' : 'bg-(--color-hover) text-(--color-accent)'
            }`}
          >
            <Icon icon={danger ? AlertTriangle : Info} />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title ?? (notice ? DEFAULT_NOTICE_TITLE : DEFAULT_TITLE)}
            </h2>
            <div id={messageId} className="mt-1.5 text-sm whitespace-pre-line text-(--color-muted)">
              {message}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {!notice && (
            <Button ref={cancelRef} variant="secondary" type="button" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button ref={confirmRef} variant={danger ? 'danger' : 'primary'} type="button" onClick={onConfirm}>
            {confirmLabel ?? (notice ? 'Tamam' : 'Onayla')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface Pending extends ConfirmOptions {
  readonly notice: boolean;
  readonly resolve: (ok: boolean) => void;
}

/**
 * `const { ask, notify, dialog } = useConfirm();` then `if (!(await ask({ message }))) return;`
 * and render `{dialog}` once. Asking again while a dialog is open answers the first one "no".
 */
export function useConfirm(): {
  ask: (options: ConfirmOptions) => Promise<boolean>;
  notify: (options: ConfirmOptions) => Promise<void>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const open = useCallback((options: ConfirmOptions, notice: boolean) => {
    pendingRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { ...options, notice, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(ok);
  }, []);

  // A dialog left open when its screen unmounts answers "no" rather than leaving a promise hanging.
  useEffect(() => () => pendingRef.current?.resolve(false), []);

  const ask = useCallback((options: ConfirmOptions) => open(options, false), [open]);
  const notify = useCallback(async (options: ConfirmOptions) => {
    await open(options, true);
  }, [open]);

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      notice={pending?.notice}
      message={pending?.message}
      title={pending?.title}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      tone={pending?.tone}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { ask, notify, dialog };
}
