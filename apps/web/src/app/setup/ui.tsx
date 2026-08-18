'use client';

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
      className={`rounded border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] ${props.className ?? ''}`}
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
      className={`rounded border border-[var(--color-border)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] ${rest.className ?? ''}`}
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
      ? 'bg-[var(--color-accent)] text-white hover:opacity-90'
      : 'border border-[var(--color-border)] bg-white hover:bg-slate-50';
  return <button {...props} className={`${base} ${styles} ${props.className ?? ''}`} />;
}

export function StatusBanner({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p
      className={`rounded px-3 py-2 text-sm ${ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-[var(--color-danger)]'}`}
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
