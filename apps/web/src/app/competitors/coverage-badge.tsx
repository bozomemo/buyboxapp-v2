'use client';

import { formatDateTime, formatNumber, formatPercent } from '@/lib/format';

export interface Coverage {
  ok: number;
  parseFailed: number;
  fetchFailed: number;
  firstAt: number | null;
  lastOkAt: number | null;
}

/** Beyond this, a "current" competitor figure is describing the past (doc 08 §12). */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Every competitor figure rests on how often we actually managed to look, and that number is
 * not a constant: in the live archive the scrape failure rate ran at 52% overall and hit
 * 128-out-of-128 for a whole hour before Playwright landed. A seller count from that window is
 * not wrong so much as it is describing far less than it appears to.
 *
 * So coverage travels *next to* the metric rather than living on a separate panel, and silence
 * is never presented as good news — no successful scrape at all is the loudest state here, not
 * the quietest.
 */
export function CoverageBadge({ coverage, sinceMs }: { coverage: Coverage; sinceMs: number }) {
  const attempted = coverage.ok + coverage.parseFailed + coverage.fetchFailed;
  const failed = coverage.parseFailed + coverage.fetchFailed;
  const failureRate = attempted > 0 ? failed / attempted : 0;
  const ageMs = coverage.lastOkAt === null ? null : Date.now() - coverage.lastOkAt;
  const stale = ageMs === null || ageMs > STALE_AFTER_MS;

  const windowMs = Date.now() - sinceMs;
  const averageGapMs = coverage.ok > 1 ? windowMs / coverage.ok : null;

  if (attempted === 0) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
        <strong>Bu dönemde hiç tarama yapılmamış.</strong> Aşağıdaki rakamlar &ldquo;rakip
        yok&rdquo; anlamına gelmez, &ldquo;bakmadık&rdquo; anlamına gelir. Rakip Verisi Toplama
        işi varsayılan olarak kapalıdır; İşler ekranından açabilirsiniz.
      </div>
    );
  }

  return (
    <div
      className={`rounded border p-3 text-sm ${
        stale || failureRate >= 0.25
          ? 'border-amber-300 bg-amber-50'
          : 'border-neutral-200 bg-neutral-50'
      }`}
    >
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <span className="text-neutral-500">Tarama:</span>{' '}
          <strong>{formatNumber(coverage.ok)}</strong> başarılı / {formatNumber(attempted)} deneme
        </span>
        {failed > 0 && (
          <span className={failureRate >= 0.25 ? 'font-medium text-amber-800' : ''}>
            <span className="text-neutral-500">Başarısız:</span> {formatNumber(failed)} (
            {formatPercent(failureRate * 100)})
          </span>
        )}
        {averageGapMs !== null && (
          <span>
            <span className="text-neutral-500">Ortalama aralık:</span>{' '}
            {(averageGapMs / 3600_000).toFixed(1)} saat
          </span>
        )}
        <span className={stale ? 'font-medium text-amber-800' : ''}>
          <span className="text-neutral-500">Son başarılı tarama:</span>{' '}
          {coverage.lastOkAt === null ? 'yok' : formatDateTime(coverage.lastOkAt)}
        </span>
      </div>
      {stale && (
        <p className="mt-2 text-amber-800">
          Veri bayat. Aşağıdaki rakamlar bugünü değil, son başarılı taramanın anını anlatıyor.
        </p>
      )}
    </div>
  );
}
