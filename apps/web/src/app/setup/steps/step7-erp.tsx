'use client';

import { Button, StepFooter } from '../ui';

export function Step7Erp({ onSkip, onBack }: { onDone: () => void; onBack: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-dashed border-[var(--color-border)] p-6 text-center text-[var(--color-muted)]">
        <p className="font-medium">ERP Bağlantısı — yakında</p>
        <p className="mt-1 text-sm">
          ERP veritabanı ve ERP API kaynakları doc 12 Faz 9 kapsamında planlanmıştır. Şimdilik bu adımı
          atlayabilirsiniz.
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={onSkip}>
          Atla
        </Button>
      </div>
      <StepFooter onBack={onBack} />
    </div>
  );
}
