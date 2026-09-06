'use client';

import { useState } from 'react';
import { Button, Field, StatusBanner, StepFooter, StepStopNotice, TextInput } from '@/components/ui';

/**
 * No route reads `store.displayName` back (only `/api/setup/store-identity` POST writes it) — so
 * unlike marketplaces/fees/policy/product-source below, this step cannot prefill itself from what
 * is already saved. Returning to this step after it was already completed always shows a blank
 * field again; fixing that needs a new GET route, which is out of this pass's scope (doc 15 §2
 * rule 2: don't change an API route's shape). Flagged in the report rather than worked around.
 */
export function Step2StoreIdentity({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState<{ ok: boolean; message: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const fieldError = touched && displayName.trim().length === 0 ? 'Görünen ad boş olamaz.' : undefined;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/setup/store-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      if (res.ok) {
        setSaved({ ok: true, message: 'Kaydedildi.' });
      } else {
        const data = (await res.json()) as { error?: string };
        setSaved({ ok: false, message: data.error ?? 'Kaydedilemedi.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--color-muted)">
        Mağaza görünen adı, raporlarda ve uyarılarda kullanılır. Pazaryeri bazlı satıcı/mağaza kimlikleri bir
        sonraki adımda (Pazaryerleri) girilir — tek doğruluk kaynağı orada saklanır (doc 08 R-CFG-4).
      </p>
      <Field label="Mağaza Görünen Adı" error={fieldError}>
        <TextInput
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Örn: Farmaucuz"
        />
      </Field>
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setTouched(true);
            if (displayName.trim().length > 0) void save();
          }}
          disabled={busy}
        >
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
      {saved && <StatusBanner ok={saved.ok} message={saved.message} />}
      <StepStopNotice>
        Bu adımı kaydetmeden çıkarsanız mağaza görünen adı boş kalır ve döndüğünüzde yeniden girmeniz gerekir.
        Raporlarda ve uyarılarda kullanılır ama fiyatlandırmayı etkilemez, bu yüzden kurulumun geri kalanını
        engellemez.
      </StepStopNotice>
      <StepFooter onBack={onBack} onNext={onDone} nextDisabled={!saved?.ok} />
    </div>
  );
}
