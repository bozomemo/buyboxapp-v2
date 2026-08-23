'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Açık' },
  { value: 'dark', label: 'Koyu' },
  { value: 'system', label: 'Sistem' },
];

function readStored(): Theme {
  try {
    const stored = window.localStorage.getItem('theme');
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system'; // localStorage unavailable (private mode, disabled storage) — fall back
  }
}

/**
 * The Açık / Koyu / Sistem control (doc 06 §11). Mounts reading `system` on the server so the
 * server-rendered and first-client-rendered markup match; the real stored choice — already
 * applied to `<html>` by the blocking script in `theme-init-script.ts`, so there is no visible
 * flash — is read in an effect right after.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(readStored());
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    try {
      if (next === 'system') {
        window.localStorage.removeItem('theme');
        document.documentElement.removeAttribute('data-theme');
      } else {
        window.localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
      }
    } catch {
      // Storage unavailable: the attribute above still applies for this page load, it just
      // won't be remembered next time.
    }
  }

  return (
    <div
      role="group"
      aria-label="Görünüm"
      className="flex overflow-hidden rounded border border-(--color-border) text-xs"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => choose(opt.value)}
          aria-pressed={theme === opt.value}
          className={`px-2.5 py-1.5 transition ${
            theme === opt.value
              ? 'bg-(--color-accent) font-semibold text-(--color-accent-ink)'
              : 'text-(--color-muted) hover:bg-(--color-hover)'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
