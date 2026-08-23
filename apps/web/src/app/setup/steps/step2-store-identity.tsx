'use client';

import { useState } from 'react';
import { Button, Field, StatusBanner, StepFooter, TextInput } from '../ui';

export function Step2StoreIdentity({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [saved, setSaved] = useState<{ ok: boolean; message: string } | undefined>();
  const [busy, setBusy] = useState(false);

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
      <Field label="Mağaza Görünen Adı">
        <TextInput
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Örn: Farmaucuz"
        />
      </Field>
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void save()}
          disabled={busy || displayName.trim().length === 0}
        >
          Kaydet
        </Button>
      </div>
      {saved && <StatusBanner ok={saved.ok} message={saved.message} />}
      <StepFooter onBack={onBack} onNext={onDone} nextDisabled={!saved?.ok} />
    </div>
  );
}
