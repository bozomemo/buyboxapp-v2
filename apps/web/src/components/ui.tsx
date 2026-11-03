'use client';

import Link from 'next/link';
import { formatDateTime, formatDuration } from '@/lib/format';
import { AlertTriangle, CheckCircle2, Icon, Inbox, Loader2, PauseCircle, type LucideIcon } from './icon';

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

/**
 * A labelled form field. Puts the label above the control, the shape every form on this screen
 * uses.
 *
 * `error` and `hint` were added for the setup wizard's per-field validation (doc 15 §6, Phase 6):
 * the wizard used to give no field-level feedback at all, only a silently `disabled` submit
 * button, which left the operator to guess why they could not proceed. Both are optional so every
 * existing caller (`<Field label="...">…</Field>`) keeps compiling unchanged.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-(--color-muted)">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs text-(--color-danger)">
          {error}
        </span>
      )}
    </label>
  );
}

/** Shared by `TextInput` and `Select`: 36px high, accent ring on focus (spec §4.2). */
const CONTROL =
  'h-9 rounded-lg border border-(--color-border) bg-(--color-surface) px-3 text-sm outline-none focus:border-(--color-accent) focus:ring-2 focus:ring-(--color-accent-border)';

/**
 * `icon` puts a decorative glyph inside the control's leading edge — a search box's magnifier —
 * without changing what the input is to a screen reader.
 */
export function TextInput({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon }) {
  if (!icon) return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
  // The wrapper is what the layout sizes, so a width class (`w-full`, `w-56`) belongs on it; on
  // the input alone `w-full` resolves against a shrink-to-fit span and collapses.
  const classes = (props.className ?? '').split(/\s+/).filter(Boolean);
  const isWidth = (c: string) => /^(w-|min-w-|max-w-|flex-1$)/.test(c);
  const width = classes.filter(isWidth).join(' ');
  const rest = classes.filter((c) => !isWidth(c)).join(' ');
  return (
    <span className={`relative inline-flex items-center ${width}`}>
      <Icon icon={icon} className="pointer-events-none absolute left-2.5 text-(--color-muted)" />
      <input {...props} className={`${CONTROL} pl-8 ${width ? 'w-full' : ''} ${rest}`} />
    </span>
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] },
) {
  const { options, ...rest } = props;
  return (
    <select {...rest} className={`${CONTROL} ${rest.className ?? ''}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghost-danger';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-(--color-accent) text-(--color-accent-ink) hover:opacity-90',
  secondary: 'border border-(--color-border) bg-(--color-surface) hover:bg-(--color-hover)',
  danger: 'bg-(--color-danger) text-(--color-danger-ink) hover:opacity-90',
  ghost: 'text-(--color-text) hover:bg-(--color-hover)',
  // A remove action in a list: destructive ink without the weight of a solid red fill.
  'ghost-danger': 'text-(--color-danger) hover:bg-(--color-danger-bg)',
};

const BUTTON_SIZE = { sm: 'h-8 text-xs', md: 'h-9 text-sm' } as const;
// Apart from the height so an icon-only button can drop it: two same-property utilities on one
// element resolve by CSS order in Tailwind v4, so a `px-0` beside `px-3` did not reliably win.
const BUTTON_PAD = { sm: 'px-3', md: 'px-4' } as const;

/**
 * `icon` renders before the label. A button with an icon and no children is icon-only, and the
 * prop type then requires `aria-label` — an unlabelled icon button is a control a screen reader
 * announces as "button" and nothing else.
 */
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZE;
  icon?: LucideIcon;
} & ({ children: React.ReactNode } | { children?: undefined; 'aria-label': string });

/**
 * The class string `Button` draws itself with, for an element that must stay something else — a
 * download `<a href>` that should look like a secondary button is still a link, not a button.
 */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: keyof typeof BUTTON_SIZE = 'md',
  square = false,
): string {
  const box = square ? (size === 'sm' ? 'w-8' : 'w-9') : BUTTON_PAD[size];
  return `inline-flex items-center justify-center gap-2 rounded-lg font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_SIZE[size]} ${box} ${BUTTON_VARIANT[variant]}`;
}

export function Button({ variant = 'primary', size = 'md', icon, children, ...props }: ButtonProps) {
  return (
    <button {...props} className={`${buttonClass(variant, size, children === undefined)} ${props.className ?? ''}`}>
      {icon && <Icon icon={icon} />}
      {children}
    </button>
  );
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

/**
 * "Bu adımı atlarsanız / şimdi çıkarsanız ne olur" sentence, stated once near the top of a wizard
 * step (doc 15 §6, Phase 6: "her adım, kullanıcı burada dururursa ne olacağını açıkça belirtsin").
 * Before this, only the ERP step said anything about the consequence of leaving mid-step; every
 * other step was silent about it.
 */
export function StepStopNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded border border-(--color-border) bg-(--color-chip-bg) px-3 py-2 text-xs text-(--color-muted)">
      {children}
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
 * correctly in greyscale or to a screen reader. `dot` adds a decorative status dot in front of it.
 */
export function Chip({
  tone,
  children,
  title,
  dot,
}: {
  tone: Tone;
  children: React.ReactNode;
  title?: string;
  dot?: boolean;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_BOX[tone]} ${TONE_TEXT[tone]}`}
    >
      {dot && <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-current" />}
      {children}
    </span>
  );
}

/**
 * Heading plus landmark, so the regions of a long screen are navigable rather than scrolled.
 *
 * `card` sets the section in a surface card. It is opt-in, not the default, because most screens
 * still wrap a bordered grid or empty state inside their sections, and turning all 52 call sites
 * into cards at once would draw a card inside a card on each of them until that screen is
 * converted (plan 2026-11-03-ui-redesign-phase-1, "Deliberate change to the spec").
 */
export function Section({
  id,
  title,
  action,
  children,
  card = false,
}: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  card?: boolean;
}) {
  return (
    <section
      aria-labelledby={id}
      className={card ? 'rounded-xl border border-(--color-border) bg-(--color-surface) p-5 shadow-(--shadow-card)' : ''}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-[15px] font-semibold text-(--color-text)">
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
 * `breadcrumb` sits above the title; its last entry is the current page. Several actions go in
 * `action` as a fragment.
 */
export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Konum" className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-(--color-muted)">
            {breadcrumb.map((crumb, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">/</span>}
                  {last || !crumb.href ? (
                    <span aria-current={last ? 'page' : undefined}>{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="hover:underline">
                      {crumb.label}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>
        )}
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-(--color-muted)">{description}</p>}
      </div>
      {/* Shrinkable, not `flex-none`: a row of filters passed as `action` must be able to wrap
          on a narrow screen rather than push the header past the content edge. */}
      {action && <div className="min-w-0 max-w-full">{action}</div>}
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
    <div className="flex gap-3 rounded-xl border border-(--color-border) bg-(--color-surface) p-4 text-sm">
      <Icon icon={Inbox} size={20} className="mt-0.5 flex-none text-(--color-muted)" />
      <div>
        <p className="font-medium">{message}</p>
        {reason && <p className="mt-1 text-(--color-muted)">{reason}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
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
    <div className={`flex gap-3 rounded-xl border p-4 ${TONE_BOX.danger}`}>
      <Icon icon={AlertTriangle} size={20} className={`mt-0.5 flex-none ${TONE_TEXT.danger}`} />
      <div>
        <p className={`text-sm font-semibold ${TONE_TEXT.danger}`}>Yüklenemedi</p>
        <p className="mt-1 text-sm">{message}</p>
        <Button variant="secondary" type="button" onClick={onRetry} className="mt-3">
          Tekrar dene
        </Button>
      </div>
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
      <p aria-live="polite" className="flex items-center gap-2 text-sm text-(--color-muted)">
        <Icon icon={Loader2} className="motion-safe:animate-spin" />
        {message}
      </p>
      {Array.from({ length: skeletonRows }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-lg border border-(--color-border) bg-(--color-surface)"
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

// --- 2026-11-03 redesign components (spec §4.3) --------------------------------------------------

/**
 * A KPI tile: a label, one large number, and optionally the line that says how it moved. `tone`
 * colours the number only — the label next to it is what says what the number means.
 */
export function StatCard({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-surface) px-5 py-4 shadow-(--shadow-card)">
      <div className="text-[13px] font-medium text-(--color-muted)">{label}</div>
      <div className={`tabular-figures mt-1.5 text-3xl font-semibold ${tone ? TONE_TEXT[tone] : ''}`}>{value}</div>
      {delta && <div className="mt-1 text-xs text-(--color-muted)">{delta}</div>}
    </div>
  );
}

/**
 * One-of-many filter with a count on each option — "Tümü 128 · Tavsiye altı 14 · Sınırda 9". Plain
 * buttons with `aria-pressed` inside a labelled group: Tab and Enter/Space already make it
 * keyboard-usable, so there is no roving tabindex. A tone colours an unselected option's label;
 * the label and count are always there, so the colour is never the only thing saying it.
 */
export function SegmentedFilter<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: V; label: string; count?: number; tone?: Tone }[];
  value: V;
  onChange: (value: V) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface) text-[13px]"
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-medium transition ${
              i > 0 ? 'border-l border-(--color-border)' : ''
            } ${
              selected
                ? 'bg-(--color-strong-bg) text-(--color-strong-ink)'
                : `hover:bg-(--color-hover) ${opt.tone ? TONE_TEXT[opt.tone] : 'text-(--color-muted)'}`
            }`}
          >
            {opt.label}
            {opt.count !== undefined && <span className="tabular-figures text-xs opacity-80">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

const VERDICT_ICON: Record<Tone, LucideIcon> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  danger: AlertTriangle,
  neutral: PauseCircle,
};

/**
 * The dashboard's top band: the system's verdict in one sentence, in its tone. `warn` uses
 * `--color-warning-strong` for the title because the plain warning hue is tuned for small text
 * and reads thin as a headline on its own tint. `level={1}` makes the title the page's `<h1>` on a
 * screen whose verdict *is* its heading (the Panel); `children` is a row under it, e.g. the
 * state chips that together answer "is it safe?".
 */
export function VerdictBanner({
  tone,
  title,
  detail,
  action,
  level = 2,
  children,
}: {
  tone: Tone;
  title: string;
  detail?: React.ReactNode;
  action?: React.ReactNode;
  level?: 1 | 2;
  children?: React.ReactNode;
}) {
  const ink =
    tone === 'warn' ? 'text-(--color-warning-strong)' : tone === 'neutral' ? 'text-(--color-text)' : TONE_TEXT[tone];
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div role="status" className={`rounded-xl border px-5 py-4 ${TONE_BOX[tone]}`}>
      <div className="flex flex-wrap items-center gap-4">
        <Icon icon={VERDICT_ICON[tone]} size={20} className={`flex-none ${TONE_TEXT[tone]}`} />
        <div className="min-w-0 flex-1">
          <Heading className={`text-[17px] font-bold ${ink}`}>{title}</Heading>
          {detail && <p className={`mt-0.5 text-sm ${ink}`}>{detail}</p>}
        </div>
        {/* Outside the announcement: a refresh button and its clock changing is not news. */}
        {action && (
          <div aria-live="off" className="flex-none">
            {action}
          </div>
        )}
      </div>
      {children && <div className="mt-3 flex flex-wrap items-center gap-2 pl-9">{children}</div>}
    </div>
  );
}
