'use client';

import { useEffect, useState } from 'react';
import { StatusBanner, StepFooter, StepStopNotice } from '@/components/ui';

type Code = 'trendyol' | 'hepsiburada';

const MARKETPLACES: { code: Code; title: string }[] = [
  { code: 'trendyol', title: 'Trendyol' },
  { code: 'hepsiburada', title: 'Hepsiburada' },
];

/**
 * The marketplaces step of a **brand-only** install (doc 17 §1.4): which marketplaces to watch,
 * and nothing else. The brand module reads public product pages, so there are no credentials to
 * enter or test — asking for them would be asking a brand manager for a store they do not have.
 */
export function Step3WatchMarketplaces({
  onDone,
  onBack,
}: {
  onDone: (enabledCodes: Code[]) => void;
  onBack: () => void;
}) {
  const [enabled, setEnabled] = useState<Record<Code, boolean>>({ trendyol: true, hepsiburada: false });
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/marketplaces')
      .then((r) =>
        r.ok ? (r.json() as Promise<{ marketplaces: { code: string; enabled: boolean }[] }>) : undefined,
      )
      .then((data) => {
        if (cancelled || !data || data.marketplaces.length === 0) return;
        setEnabled({
          trendyol: data.marketplaces.some((m) => m.code === 'trendyol' && m.enabled),
          hepsiburada: data.marketplaces.some((m) => m.code === 'hepsiburada' && m.enabled),
        });
      })
      // No prefill: the defaults above (Trendyol on) stand, as they do on a fresh install.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      for (const { code } of MARKETPLACES) {
        const res = await fetch('/api/setup/marketplace/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, enabled: enabled[code] }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      onDone(MARKETPLACES.filter((m) => enabled[m.code]).map((m) => m.code));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const noneSelected = !enabled.trendyol && !enabled.hepsiburada;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--color-muted)">
        Hangi pazaryerlerini izlemek istiyorsunuz? Marka izleme herkese açık ürün sayfalarını okur; pazaryeri
        API bilgisi gerekmez.
      </p>
      {MARKETPLACES.map((m) => (
        <label
          key={m.code}
          className="flex cursor-pointer items-center gap-3 rounded border border-(--color-border) p-4"
        >
          <input
            type="checkbox"
            checked={enabled[m.code]}
            onChange={(e) => setEnabled({ ...enabled, [m.code]: e.target.checked })}
          />
          <span className="font-semibold">{m.title}</span>
        </label>
      ))}
      {noneSelected && <StatusBanner ok={false} message="En az bir pazaryeri seçin." />}
      {error && <StatusBanner ok={false} message={`Kaydedilemedi: ${error}`} />}
      <StepStopNotice>
        Seçmediğiniz bir pazaryerini sonradan Ayarlar &gt; Pazaryerleri ekranından açabilirsiniz.
      </StepStopNotice>
      <StepFooter onBack={onBack} onNext={() => void save()} nextDisabled={busy || noneSelected} />
    </div>
  );
}
