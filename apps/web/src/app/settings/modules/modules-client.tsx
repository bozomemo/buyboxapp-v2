'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AppModule, EnabledModules } from '@buybox/shared';
import { Button, ConfirmButton, ErrorState, LoadingState, Section, StatusBanner } from '@/components/ui';
import { formatNumber } from '@/lib/format';

interface ModulesState {
  modules: EnabledModules;
  awaitingConfirmation: number;
  priceSwitchEngaged: boolean;
}

const MODULES: { key: AppModule; title: string; description: string }[] = [
  {
    key: 'seller',
    title: 'Pazaryeri satıcısı',
    description:
      'Kendi ilanlarınız, maliyet ve komisyon hesabı, otomatik fiyatlandırma ve fiyat gönderimi. Stok, İlanlar, Markalar, Rakip Geçmişi, Rakip Satıcılar ve Alarmlar ekranları bu modüldedir.',
  },
  {
    key: 'brand',
    title: 'Marka ürün yöneticisi',
    description:
      'Markanızın ürünlerini kimin, hangi fiyata sattığını izleme. İzlenen Markalar, Takip Edilen Ürünler, Marka Satıcıları, Satıcı Politikası, Denetim Bulguları, Pazaryeri Eşleşmesi ve Marka Karşılaştırması ekranları bu modüldedir.',
  },
];

/**
 * Settings > Modüller (doc 17 §1.3).
 *
 * Turning the seller module **off** is the one direction that confirms, because it stops price
 * decisions and engages the price-submission switch; turning a module on, or the brand module
 * off, changes only what is watched. After a save the page reloads, because the sidebar reads
 * the modules once when the shell mounts and would otherwise keep drawing the old menu.
 */
export function ModulesClient({ redirectedFrom }: { redirectedFrom: AppModule | null }) {
  const [state, setState] = useState<ModulesState | null>(null);
  const [draft, setDraft] = useState<EnabledModules | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadError(null);
    fetch('/api/modules')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Modüller yüklenemedi (HTTP ${r.status}).`))))
      .then((data: ModulesState) => {
        setState(data);
        setDraft(data.modules);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      window.location.reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!state || !draft) return <LoadingState message="Modüller yükleniyor…" skeletonRows={2} />;

  const changed = draft.seller !== state.modules.seller || draft.brand !== state.modules.brand;
  const noneSelected = !draft.seller && !draft.brand;
  const turningSellerOff = state.modules.seller && !draft.seller;

  return (
    <div className="flex flex-col gap-4">
      {redirectedFrom && !state.modules[redirectedFrom] && (
        <StatusBanner
          ok={false}
          message={`Açmaya çalıştığınız ekran "${MODULES.find((m) => m.key === redirectedFrom)?.title}" modülüne ait ve bu modül kapalı. Aşağıdan açabilirsiniz.`}
        />
      )}

      <p className="text-sm text-(--color-muted)">
        Bu kurulumun hangi işleri yaptığını belirler. Kapalı bir modülün menüsü gizlenir, ekranları ve
        API'leri yanıt vermez, arka plan işleri çalışmaz. Hiçbir veri silinmez — modülü tekrar açtığınızda
        kaldığı yerden devam eder.
      </p>

      <Section id="modules" title="Modüller">
        <div className="flex flex-col gap-3">
          {MODULES.map((m) => (
            <label
              key={m.key}
              className="flex cursor-pointer gap-3 rounded border border-(--color-border) bg-(--color-surface) p-4"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={draft[m.key]}
                onChange={(e) => setDraft({ ...draft, [m.key]: e.target.checked })}
              />
              <span>
                <span className="block font-semibold">{m.title}</span>
                <span className="block text-sm text-(--color-muted)">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {noneSelected && <StatusBanner ok={false} message="En az bir modül açık kalmalı." />}

      {turningSellerOff && (
        <p className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-3 text-sm text-(--color-warning)">
          Satıcı modülünü kapatmak fiyat kararlarını ve fiyat gönderimini hemen durdurur ve fiyat gönderim
          anahtarını devreye alır. Modülü sonradan açtığınızda gönderim kendiliğinden başlamaz; paneldeki
          anahtarı siz kapatana kadar bekler.
        </p>
      )}

      {!state.modules.seller && state.awaitingConfirmation > 0 && (
        <p className="rounded border border-(--color-border) bg-(--color-chip-bg) p-3 text-sm">
          {formatNumber(state.awaitingConfirmation)} fiyat gönderimi pazaryeri onayı bekliyor. Satıcı modülü
          kapalı olsa da onay işi bunlar sonuçlanana kadar çalışmaya devam eder — onaylanmamış bir fiyat
          değişikliği kayıtsız kalmasın diye.
        </p>
      )}

      <div>
        {turningSellerOff ? (
          <ConfirmButton
            requireConfirm
            confirmMessage="Satıcı modülünü kapatmak üzeresiniz. Fiyat kararları ve gönderimi duracak, fiyat gönderim anahtarı devreye alınacak. Emin misiniz?"
            onConfirmed={() => void save()}
            disabled={busy || noneSelected}
            className="rounded bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-ink) hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </ConfirmButton>
        ) : (
          <Button type="button" onClick={() => void save()} disabled={busy || !changed || noneSelected}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        )}
      </div>
      {saveError && <StatusBanner ok={false} message={`Kaydedilemedi: ${saveError}`} />}
    </div>
  );
}
