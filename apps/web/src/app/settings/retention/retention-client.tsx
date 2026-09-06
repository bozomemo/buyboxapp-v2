'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, ErrorState, Field, LoadingState, Section, StatusBanner, TextInput } from '@/components/ui';

/** Settings > Retention (doc 15 §6, Phase 5). Consistency pass only. */

interface Windows {
  priceSubmissionsDays: number;
  buyboxObservationsDays: number;
  competitorObservationsDays: number;
  trackedProductObservationsDays: number;
  trackedProductMetricsDays: number;
  appEventsInfoDebugDays: number;
  appEventsWarnErrorDays: number;
  jobRunsDays: number;
  jobQueueFinishedDays: number;
}

const LABELS: { key: keyof Windows; label: string }[] = [
  { key: 'priceSubmissionsDays', label: 'Fiyat gönderimleri (gün)' },
  { key: 'buyboxObservationsDays', label: 'Buybox gözlemleri (gün)' },
  { key: 'competitorObservationsDays', label: 'Rakip teklif kayıtları (gün)' },
  { key: 'trackedProductObservationsDays', label: 'Takip edilen ürün kayıtları (gün)' },
  { key: 'trackedProductMetricsDays', label: 'Değerlendirme geçmişi (gün)' },
  { key: 'appEventsInfoDebugDays', label: 'Bilgi/debug olayları (gün)' },
  { key: 'appEventsWarnErrorDays', label: 'Uyarı/hata olayları (gün)' },
  { key: 'jobRunsDays', label: 'İş çalıştırma geçmişi (gün)' },
  { key: 'jobQueueFinishedDays', label: 'Tamamlanmış iş kuyruğu satırları (gün)' },
];

export function RetentionClient() {
  const [windows, setWindows] = useState<Windows | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    fetch('/api/settings/retention')
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`Saklama ayarları yüklenemedi (HTTP ${r.status}).`)),
      )
      .then((data: { windows: Windows; isDefault: boolean }) => {
        setWindows(data.windows);
        setIsDefault(data.isDefault);
        setHasLoadedOnce(true);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : String(e));
        setHasLoadedOnce(true);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!windows) return;
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings/retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(windows),
      });
      setSaved(res.ok);
      setIsDefault(false);
    } finally {
      setBusy(false);
    }
  }

  if (!hasLoadedOnce) {
    return <LoadingState message="Saklama ayarları yükleniyor…" skeletonRows={3} />;
  }

  if (loadError || !windows) {
    return <ErrorState message={loadError ?? 'Saklama ayarları okunamadı.'} onRetry={load} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--color-muted)">
        {isDefault
          ? 'Şu anda varsayılan pencereler kullanılıyor (doc 05 §10).'
          : 'Özelleştirilmiş pencereler kullanılıyor.'}{' '}
        <code>competitor_observations</code> ve <code>scrape_runs</code> süresiz saklanır ve burada
        listelenmez (doc 10 §5).
      </p>
      <Section id="retention-windows" title="Saklama Pencereleri">
        <div className="grid grid-cols-2 gap-4 rounded border border-(--color-border) p-4">
          {LABELS.map(({ key, label }) => (
            <Field key={key} label={label}>
              <TextInput
                type="number"
                min={1}
                value={String(windows[key])}
                onChange={(e) => setWindows({ ...windows, [key]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
      </Section>
      <div>
        <Button type="button" onClick={() => void save()} disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
      {saved && <StatusBanner ok message="Saklama pencereleri kaydedildi." />}
    </div>
  );
}
