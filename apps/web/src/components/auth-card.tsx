'use client';

/**
 * The standalone frame of the sign-in screens (doc 06 §10.1): no navigation and no kill-switch
 * bar, because nothing on those is usable before sign-in. `NavShell` renders these routes bare.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg) p-4">
      <div className="w-full max-w-sm rounded-lg border border-(--color-border) bg-(--color-surface) p-6 shadow-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-(--color-muted)">BuyBoxApp</div>
        <h1 className="mb-2 text-lg font-bold">{title}</h1>
        {subtitle && <div className="mb-4 text-sm text-(--color-muted)">{subtitle}</div>}
        {children}
      </div>
    </div>
  );
}

/** POSTs JSON and returns the parsed body with `ok`, never throwing on a 4xx. */
export async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // An empty or non-JSON body still has a status worth reporting.
  }
  return { ok: res.ok, status: res.status, data };
}

export function errorMessage(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.message === 'string') return data.message;
  if (typeof data.error === 'string' && /\s/.test(data.error)) return data.error;
  return fallback;
}
