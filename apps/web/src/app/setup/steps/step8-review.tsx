'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, StatusBanner, StepFooter } from '../ui';

export function Step8Review({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [result, setResult] = useState<{ ok: boolean; message: string } | undefined>();
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    try {
      const res = await fetch('/api/setup/finish', { method: 'POST' });
      if (res.ok) {
        setResult({ ok: true, message: 'Kurulum tamamlandı. Panele yönlendiriliyorsunuz…' });
        setTimeout(() => router.push('/'), 800);
      } else {
        const data = (await res.json()) as { error?: string };
        setResult({ ok: false, message: data.error ?? 'Tamamlanamadı.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--color-muted)]">
        Veritabanı hazır, mağaza kimliği kaydedildi, pazaryeri kimlik bilgileri şifreli olarak saklandı, ücret
        ve politika ayarları girildi, ürün kaynağı yapılandırıldı. Otomasyon her pazaryerinde{' '}
        <strong>kapalı</strong> olarak başlayacak — Panel'den bilinçli olarak açacaksınız (doc 10 §6, adım 8).
        Sistem bittiğinde ürünleri içe aktarıp gözlemlemeye başlayacak, fiyat göndermeyecektir.
      </p>
      <div>
        <Button type="button" onClick={() => void finish()} disabled={busy}>
          Kurulumu Bitir
        </Button>
      </div>
      {result && <StatusBanner ok={result.ok} message={result.message} />}
      <StepFooter onBack={onBack} />
    </div>
  );
}
