'use client';

import { formatDateTime, formatDuration } from '@/lib/format';

/**
 * The shared UI kit (doc 15 §1a). Everything a screen needs to render a form, a status, a
 * timestamp or the six required states (doc 15 §3.2) lives here rather than being reinvented per
 * screen.
 *
 * Moved here from the setup wizard's own `ui.tsx` on 2026-09-06: five Settings screens were already reaching
 * into the setup wizard's own folder for their buttons, which is backwards, and it is why the kit
 * had never grown past six components before this move (doc 15 §1). This file absorbs that kit's
 * form primitives, the dashboard's status primitives, and adds the five new components every
 * later screen in the redesign pass is expected to reuse rather than fork.
 */

/** A labelled form field. Puts the label above the control, the shape every form on this screen uses. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`rounded border border-(--color-border) px-3 py-1.5 text-sm outline-none focus:border-(--color-accent) ${props.className ?? ''}`}
    />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] },
) {
  const { options, ...rest } = props;
  return (
    <select
      {...rest}
      className={`rounded border border-(--color-border) px-3 py-1.5 text-sm outline-none focus:border-(--color-accent) ${rest.className ?? ''}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Button({
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const base = 'rounded px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
  const styles =
    variant === 'primary'
      ? 'bg-(--color-accent) text-(--color-accent-ink) hover:opacity-90'
      : 'border border-(--color-border) bg-(--color-surface) hover:bg-(--color-hover)';
  return <button {...props} className={`${base} ${styles} ${props.className ?? ''}`} />;
}

export function StatusBanner({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p
      className={`rounded px-3 py-2 text-sm ${ok ? 'bg-(--color-success-bg) text-(--color-success)' : 'bg-(--color-danger-bg) text-(--color-danger)'}`}
    >
      {message}
    </p>
  );
}

export function StepFooter({
  onBack,
  onNext,
  nextLabel = 'İleri',
  nextDisabled,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-between">
      {onBack ? (
        <Button variant="secondary" type="button" onClick={onBack}>
          Geri
        </Button>
      ) : (
        <span />
      )}
      {onNext && (
        <Button type="button" onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
        </Button>
      )}
    </div>
  );
}

// --- Tone --------------------------------------------------------------------------------------

/**
 * The one vocabulary every status colour on the app is drawn from (doc 15 §2 rule 7: colour only
 * through tokens, never a raw Tailwind palette class). `neutral` is deliberately not "the default
 * good state" — it means "informational, no verdict attached", distinct from `ok`.
 */
export type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

export const TONE_BOX: Record<Tone, string> = {
  ok: 'border-(--color-success-border) bg-(--color-success-bg)',
  warn: 'border-(--color-warning-border) bg-(--color-warning-bg)',
  danger: 'border-(--color-danger-border) bg-(--color-danger-bg)',
  neutral: 'border-(--color-border) bg-(--color-surface)',
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-(--color-success)',
  warn: 'text-(--color-warning)',
  danger: 'text-(--color-danger)',
  neutral: 'text-(--color-muted)',
};

/**
 * A status word plus its tone. The word is always present: colour is never the only carrier of a
 * state (WCAG 2.2 AA, 1.4.1, doc 15 §2 rule 8), so every chip built from this still reads
 * correctly in greyscale or to a screen reader.
 */
export function Chip({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold ${TONE_BOX[tone]} ${TONE_TEXT[tone]}`}
    >
      {children}
    </span>
  );
}

/** Heading plus landmark, so the regions of a long screen are navigable rather than scrolled. */
export function Section({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * "14dk önce" rather than "5.09.2026 14:03:12" (doc 15 §3.3). The operator's question at almost
 * every timestamp in this app is *is this stale*, and an absolute clock time makes them do the
 * subtraction themselves. The absolute value stays in the tooltip, because "when exactly" is the
 * next question, not the first one.
 */
export function Ago({ at, never = 'hiç' }: { at: number | null | undefined; never?: string }) {
  if (at === null || at === undefined) return <span className="text-(--color-muted)">{never}</span>;
  return <span title={formatDateTime(at)}>{formatDuration(Math.max(0, Date.now() - at))} önce</span>;
}

// --- New Phase 1a components --------------------------------------------------------------------

/**
 * One `<h1>` per screen (doc 15 §3.7), with room for the sentence that says what the screen is
 * for and the one dominant action it exists to trigger (doc 15 §3.1). Centralised so no screen
 * has to decide on its own how large the title is or where the primary button sits relative to it.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-(--color-muted)">{description}</p>}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}

/**
 * The empty state every list must show instead of a bare "Kayıt yok." (doc 15 §3.2): it says why
 * there is nothing here and, where there is one, the action that fills it. A screen with no
 * `reason` is not exempt from explaining itself — it is a sign the caller has not thought about
 * why the list can be empty yet.
 */
export function EmptyState({
  message,
  reason,
  action,
}: {
  message: string;
  reason?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-(--color-border) bg-(--color-surface) p-4 text-sm">
      <p className="font-medium">{message}</p>
      {reason && <p className="mt-1 text-(--color-muted)">{reason}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * The error state every primary load must show (doc 15 §3.2): what failed, and a **"Tekrar
 * dene"** button. Before this component only `/` had a retry affordance (doc 15 baseline, 1 of
 * 26 files) — every other screen stranded the operator on a silent, dead screen.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={`rounded border p-4 ${TONE_BOX.danger}`}>
      <p className={`text-sm font-semibold ${TONE_TEXT.danger}`}>Yüklenemedi</p>
      <p className="mt-1 text-sm">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm font-semibold hover:bg-(--color-hover)"
      >
        Tekrar dene
      </button>
    </div>
  );
}

/**
 * The loading state every primary load must show, distinct from the error state (doc 15 §3.2 —
 * "never share a line with the error state"). `aria-live="polite"` so a screen reader announces
 * it without the caller having to remember to add the attribute itself.
 */
export function LoadingState({ message, skeletonRows = 0 }: { message: string; skeletonRows?: number }) {
  return (
    <div className="space-y-3">
      <p aria-live="polite" className="text-sm text-(--color-muted)">
        {message}
      </p>
      {Array.from({ length: skeletonRows }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded border border-(--color-border) bg-(--color-surface)"
        />
      ))}
    </div>
  );
}

/**
 * Wraps the §3.6 confirmation asymmetry so screens stop hand-rolling `window.confirm`: the
 * direction that creates risk (`requireConfirm`) is confirmed with a message naming what is about
 * to happen; the safe direction is one click. A caller that always passes `requireConfirm={false}`
 * — the safe-direction case — gets a plain button, not a dialog nobody needed.
 */
export function ConfirmButton({
  requireConfirm,
  confirmMessage,
  onConfirmed,
  children,
  ...rest
}: {
  requireConfirm: boolean;
  confirmMessage: string;
  onConfirmed: () => void;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  function handleClick() {
    if (requireConfirm && !window.confirm(confirmMessage)) return;
    onConfirmed();
  }
  return (
    <button {...rest} type="button" onClick={handleClick}>
      {children}
    </button>
  );
}
