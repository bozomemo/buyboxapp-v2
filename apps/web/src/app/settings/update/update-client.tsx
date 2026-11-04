'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ago, Button, buttonClass, ConfirmButton, ErrorState, LoadingState, Section, StatusBanner } from '@/components/ui';
import { labelOf, UPDATE_CHECK_LABELS, UPDATE_OUTCOME_LABELS } from '@/lib/labels';

/**
 * Settings > Güncelleme (auto-update spec §5.3). Shows what the update check found and what the
 * updater did, and offers the one action that starts an installation. The page installs nothing
 * itself: "Şimdi kur" asks the server to start the BuyBoxUpdater task, and the service then goes
 * away for a couple of minutes while apply-update.ps1 swaps it out.
 */

interface UpdateView {
  available: boolean;
  currentVersion: string | null;
  inProgress: boolean;
  state: {
    lastCheckAt: string | null;
    lastResult: string;
    lastError: string | null;
    ready: { version: string; notes: string; downloadBytes: number; components: string[] } | null;
  } | null;
  status: {
    phase: string;
    step: string | null;
    history: { at: string; from: string; to: string; outcome: string; reason: string | null }[];
  } | null;
}

const CONFIRM_MESSAGE = 'Servis 2–3 dakika duracak. Fiyat işleri yeni sürüm doğrulanana kadar duraklatılmış kalacak.';
const POLL_MS = 3000;
/** Past this, stop waiting and show whatever the files say; the history names the outcome. */
const POLL_LIMIT_MS = 10 * 60_000;

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

export function UpdateClient() {
  const [view, setView] = useState<UpdateView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async (): Promise<UpdateView | null> => {
    setLoadError(null);
    try {
      const res = await fetch('/api/update');
      if (!res.ok) throw new Error(`Güncelleme durumu yüklenemedi (HTTP ${res.status}).`);
      const data = (await res.json()) as UpdateView;
      setView(data);
      return data;
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
    return () => clearTimeout(timer.current);
  }, [load]);

  // While the updater runs the service stops and starts, so most polls fail; that is expected.
  // Done when the files say nothing is pending any more.
  const pollUntilDone = useCallback(
    (startedAt: number) => {
      timer.current = setTimeout(async () => {
        let done = false;
        try {
          const res = await fetch('/api/update');
          if (res.ok) {
            const data = (await res.json()) as UpdateView;
            if (!data.inProgress) {
              setView(data);
              done = true;
            }
          }
        } catch {
          // The service is down mid-update.
        }
        if (done || Date.now() - startedAt > POLL_LIMIT_MS) {
          setInstalling(false);
          if (!done) void load();
        } else {
          pollUntilDone(startedAt);
        }
      }, POLL_MS);
    },
    [load],
  );

  async function install(version: string) {
    setActionError(null);
    const res = await fetch('/api/update/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    });
    if (res.status !== 202) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setActionError(body.error ?? `Kurulum başlatılamadı (HTTP ${res.status}).`);
      return;
    }
    setInstalling(true);
    pollUntilDone(Date.now());
  }

  async function checkNow() {
    setActionError(null);
    setChecking(true);
    try {
      const res = await fetch('/api/update/check', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(body.error ?? `Kontrol yapılamadı (HTTP ${res.status}).`);
      }
      await load();
    } finally {
      setChecking(false);
    }
  }

  if (!view && !loadError) return <LoadingState message="Güncelleme durumu yükleniyor…" />;
  if (!view) return <ErrorState message={loadError ?? 'Güncelleme durumu okunamadı.'} onRetry={() => void load()} />;

  if (!view.available) {
    return <p className="text-sm text-(--color-muted)">Bu kurulumda otomatik güncelleme yok.</p>;
  }

  const ready = view.state?.ready ?? null;
  const history = view.status?.history ?? [];

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <Section id="update-current" title="Kurulu Sürüm" card>
        <p className="text-sm">
          Çalışan sürüm: <strong>{view.currentVersion ?? 'bilinmiyor'}</strong>
        </p>
        <p className="mt-1 text-sm text-(--color-muted)">
          Son kontrol:{' '}
          <Ago at={view.state?.lastCheckAt ? Date.parse(view.state.lastCheckAt) : null} never="henüz yapılmadı" />
          {view.state && <> — {labelOf(UPDATE_CHECK_LABELS, view.state.lastResult)}</>}
        </p>
        {view.state?.lastError && <p className="mt-1 text-sm text-(--color-muted)">{view.state.lastError}</p>}
        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={() => void checkNow()} disabled={checking || installing}>
            {checking ? 'Kontrol ediliyor…' : 'Şimdi kontrol et'}
          </Button>
        </div>
      </Section>

      {ready && (
        <Section id="update-ready" title="Kurulmaya Hazır" card>
          <p className="text-lg font-semibold">{ready.version}</p>
          <p className="text-sm text-(--color-muted)">{megabytes(ready.downloadBytes)}</p>
          {ready.notes && <p className="mt-2 whitespace-pre-line text-sm">{ready.notes}</p>}
          <div className="mt-3">
            {installing ? (
              <StatusBanner ok message="Kuruluyor…" />
            ) : (
              <ConfirmButton
                requireConfirm
                confirmMessage={CONFIRM_MESSAGE}
                onConfirmed={() => void install(ready.version)}
                className={buttonClass('primary')}
                disabled={view.inProgress}
              >
                Şimdi kur
              </ConfirmButton>
            )}
          </div>
        </Section>
      )}

      {actionError && <StatusBanner ok={false} message={actionError} />}

      {history.length > 0 && (
        <Section id="update-history" title="Geçmiş" card>
          <ul className="flex flex-col gap-2 text-sm">
            {history.map((entry) => (
              <li key={`${entry.at}-${entry.to}`}>
                <span className="font-semibold">{labelOf(UPDATE_OUTCOME_LABELS, entry.outcome)}</span>{' '}
                <span className="text-(--color-muted)">
                  {entry.from} → {entry.to}, <Ago at={Date.parse(entry.at)} />
                </span>
                {entry.reason && <div className="text-(--color-muted)">{entry.reason}</div>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
