'use client';

/**
 * A file picker that speaks Turkish (review 2026-11-25).
 *
 * The native `<input type="file">` draws its own button and its own "No file chosen" in the
 * **browser's** language, which the page cannot change — so Stok, Kâr Ayarları and Satıcı
 * Politikası said "Choose file" in the middle of a Turkish screen. The native input stays (it is
 * what the operating system's picker and every existing ref and handler talk to) but is visually
 * hidden; a label styled as a button opens it, and the chosen file's name is written beside it.
 */
import { forwardRef, useId, useState } from 'react';
import { buttonClass } from './ui';

export type FileInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Button text. */
  readonly buttonLabel?: string;
};

export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(function FileInput(
  { buttonLabel = 'Dosya seç', onChange, className, id, disabled, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const [name, setName] = useState<string | null>(null);
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <input
        {...rest}
        ref={ref}
        id={inputId}
        type="file"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          setName(e.target.files?.[0]?.name ?? null);
          onChange?.(e);
        }}
      />
      <label
        htmlFor={inputId}
        aria-disabled={disabled || undefined}
        className={`${buttonClass('secondary', 'sm')} cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        {buttonLabel}
      </label>
      <span className="truncate text-sm text-(--color-muted)">{name ?? 'Dosya seçilmedi'}</span>
    </span>
  );
});
