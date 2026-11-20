'use client';

/**
 * "Bant piyasadan uzak olabilir" (brand roadmap §6.12): every seller's price on the product's
 * cards sat on one side of the band for the whole window. A note only — the alarms are unchanged;
 * the manager decides whether the band or the market is wrong.
 */

import { formatMoney } from '@/lib/format';

export interface BandRealismView {
  kind: 'insufficient' | 'consistent' | 'allAbove' | 'allBelow';
  looks: number;
  /** Per unit, kuruş string, for display. */
  medianUnitPrice: string | null;
  windowDays: number;
}

export function BandRealismNote({ realism }: { realism: BandRealismView | undefined }) {
  if (!realism || (realism.kind !== 'allAbove' && realism.kind !== 'allBelow')) return null;
  const side = realism.kind === 'allAbove' ? 'üst sınırın üstünde' : "Min'in altında";
  return (
    <div className="rounded border border-(--color-warning-border) bg-(--color-warning-bg) p-3 text-sm">
      <h2 className="font-semibold text-(--color-warning)">Bant piyasadan uzak olabilir</h2>
      <p className="mt-1">
        Son {realism.windowDays} günde bağlı kartlarda kaydedilen {realism.looks} fiyatın hepsi {side}.
        {realism.medianUnitPrice !== null && (
          <> Birim başına ortanca fiyat {formatMoney(BigInt(realism.medianUnitPrice))}.</>
        )}{' '}
        Bandı gözden geçirin ya da piyasanın neden bandın dışında olduğuna bakın. Alarmlar değişmez.
      </p>
    </div>
  );
}
