'use client';

import { useCallback, useEffect, useState } from 'react';
import { Chip, ErrorState, LoadingState, Section } from '@/components/ui';

/**
 * Settings > Database (doc 15 §6, Phase 5). Read-only diagnostics — no destructive action lives
 * here, so §3.6's confirmation asymmetry does not apply to this screen (checked deliberately,
 * not an oversight: see the per-screen rationale in the task report).
 */

interface Info {
  dialect: string;
  connection: string;
  schemaVersion: { upToDate: boolean; appliedCount: number; expectedCount: number };
}

export function DatabaseClient() {
  const [info, setInfo] = useState<Info | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    fetch('/api/settings/database')
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`Veritabanı bilgisi okunamadı (HTTP ${r.status}).`)),
      )
      .then((data: Info) => setInfo(data))
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setHasLoadedOnce(true));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!hasLoadedOnce) {
    return <LoadingState message="Veritabanı bilgisi yükleniyor…" skeletonRows={1} />;
  }

  if (loadError || !info) {
    return <ErrorState message={loadError ?? 'Veritabanı bilgisi okunamadı.'} onRetry={load} />;
  }

  return (
    <Section id="database-status" title="Veritabanı Durumu">
      <div className="max-w-md rounded border border-(--color-border) p-4">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-(--color-muted)">Motor</dt>
            <dd className="font-medium">{info.dialect}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-(--color-muted)">Bağlantı</dt>
            <dd className="font-mono text-xs">{info.connection}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-(--color-muted)">Şema Sürümü</dt>
            <dd className="flex items-center gap-2">
              <span>
                {info.schemaVersion.appliedCount}/{info.schemaVersion.expectedCount} göç uygulandı
              </span>
              <Chip tone={info.schemaVersion.upToDate ? 'ok' : 'danger'}>
                {info.schemaVersion.upToDate ? 'güncel' : 'güncel değil'}
              </Chip>
            </dd>
          </div>
        </dl>
      </div>
    </Section>
  );
}
