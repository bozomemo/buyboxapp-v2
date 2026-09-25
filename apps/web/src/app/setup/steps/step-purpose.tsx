'use client';

import { useEffect, useState } from 'react';
import type { EnabledModules } from '@buybox/shared';
import { StatusBanner, StepFooter, StepStopNotice } from '@/components/ui';

/**
 * "Kullanım amacı" (doc 17 §1.4): which of the two modules this install runs. Stored through
 * `/api/modules`, the same route Settings > Modüller writes, and prefilled from it — re-running
 * the wizard shows what was chosen rather than asking again.
 */
export function StepPurpose({
  onDone,
  onBack,
}: {
  onDone: (modules: EnabledModules) => void;
  onBack: () => void;
}) {
  const [modules, setModules] = useState<EnabledModules>({ seller: true, brand: true });
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/modules')
      .then((r) => (r.ok ? (r.json() as Promise<{ modules: EnabledModules }>) : undefined))
      .then((data) => {
        if (!cancelled && data) setModules(data.modules);
      })
      // No prefill — both boxes stay ticked, which is also what an install that never chose runs.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modules),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onDone(modules);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const noneSelected = !modules.seller && !modules.brand;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--color-muted)">
        Bu kurulumu ne için kullanacaksınız? İkisini birden seçebilirsiniz. Seçiminize göre sihirbazın sonraki
        adımları ve uygulamanın menüleri belirlenir; daha sonra Ayarlar &gt; Modüller ekranından
        değiştirebilirsiniz.
      </p>
      <label className="flex cursor-pointer gap-3 rounded border border-(--color-border) p-4">
        <input
          type="checkbox"
          className="mt-1"
          checked={modules.seller}
          onChange={(e) => setModules({ ...modules, seller: e.target.checked })}
        />
        <span>
          <span className="block font-semibold">Pazaryeri satıcısıyım</span>
          <span className="block text-sm text-(--color-muted)">
            Kendi ilanlarımın fiyatını buybox'a göre otomatik ayarlamak istiyorum. Pazaryeri API bilgileri,
            ücret ve fiyat politikası adımları sorulur.
          </span>
        </span>
      </label>
      <label className="flex cursor-pointer gap-3 rounded border border-(--color-border) p-4">
        <input
          type="checkbox"
          className="mt-1"
          checked={modules.brand}
          onChange={(e) => setModules({ ...modules, brand: e.target.checked })}
        />
        <span>
          <span className="block font-semibold">Marka ürün yöneticisiyim</span>
          <span className="block text-sm text-(--color-muted)">
            Markamın ürünlerini pazaryerinde kimin, hangi fiyata sattığını izlemek istiyorum. Pazaryeri API
            bilgisi gerekmez; herkese açık ürün sayfaları okunur.
          </span>
        </span>
      </label>
      {noneSelected && <StatusBanner ok={false} message="En az birini seçin." />}
      {error && <StatusBanner ok={false} message={`Kaydedilemedi: ${error}`} />}
      <StepStopNotice>
        Burada durursanız hiçbir şey değişmez: seçim yapılmamış bir kurulum iki modülü de açık sayar.
      </StepStopNotice>
      <StepFooter onBack={onBack} onNext={() => void save()} nextDisabled={busy || noneSelected} />
    </div>
  );
}
