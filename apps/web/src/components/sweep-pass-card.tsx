'use client';

/**
 * "Tur #12 — 1.240 / 4.679" — how far a sweep is through its candidate set (doc 07 §7.4, §7.5,
 * doc 06 §12.2). Shared by `/tracked-products` (the catalogue lane) and `/jobs` (both lanes, doc
 * 12 Phase 11.5), because the two are the same card reading a different `scope`.
 *
 * This is the figure neither screen could show before the pass model: a sweep used to read a
 * fixed number of products an hour and report *that* as its total, so an operator looking at
 * thousands of rows had no way to tell whether the numbers in front of them were fresh. A pass is
 * a full lap, so "kaç üründen kaçı" is a real fraction and the estimate is the pass's own measured
 * rate rather than a configured limit.
 *
 * Absent rather than empty when no pass exists (the sweep has never been enabled): a progress bar
 * at zero would read as a stalled job rather than as a job nobody switched on.
 */
import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/format';

interface SweepPass {
  passNo: number;
  startedAt: number;
  finishedAt: number | null;
  plannedCount: number;
  doneCount: number;
  failedCount: number;
  estimatedFinishAtMs: number | null;
}

interface PreviousPass {
  passNo: number;
  doneCount: number;
  durationMs: number;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatSpan(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} dk`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}

export interface SweepPassCardProps {
  readonly marketplaceCode: string;
  readonly scope: 'all' | 'listed';
  /** "Tarama turu" / "İlanlar turu" — precedes the pass number. */
  readonly label: string;
  /** How often to poll. A pass moves at a page every few seconds, so a minute is plenty. */
  readonly pollMs?: number;
}

export function SweepPassCard({ marketplaceCode, scope, label, pollMs = 60_000 }: SweepPassCardProps) {
  const [pass, setPass] = useState<SweepPass | null>(null);
  const [previous, setPrevious] = useState<PreviousPass[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/tracked-products/sweep-pass?marketplaceCode=${marketplaceCode}&scope=${scope}`)
        .then((r) => r.json())
        .then((d: { current: SweepPass | null; previous: PreviousPass[] }) => {
          if (cancelled) return;
          setPass(d.current);
          setPrevious(d.previous);
          setLoaded(true);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [marketplaceCode, scope, pollMs]);

  if (!loaded || !pass) return null;

  const done = Math.min(pass.doneCount, pass.plannedCount);
  const percent = pass.plannedCount > 0 ? Math.round((done / pass.plannedCount) * 100) : 0;
  const last = previous[0];

  return (
    <div className="rounded border border-(--color-border) p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">
          {label} #{pass.passNo}
        </span>
        <span className="tabular-nums">
          {formatNumber(done)} / {formatNumber(pass.plannedCount)} ürün
          <span className="text-(--color-muted)"> (%{percent})</span>
        </span>
        {pass.failedCount > 0 && (
          <span className="text-(--color-muted)">{formatNumber(pass.failedCount)} okunamadı</span>
        )}
        <span className="text-(--color-muted)">Başlangıç {formatClock(pass.startedAt)}</span>
        {pass.finishedAt !== null ? (
          <span className="text-(--color-muted)">
            Tamamlandı {formatClock(pass.finishedAt)} · yeni tur birazdan başlar
          </span>
        ) : (
          pass.estimatedFinishAtMs !== null && (
            <span className="text-(--color-muted)">
              Tahmini bitiş {formatClock(pass.estimatedFinishAtMs)}
            </span>
          )
        )}
        {last && (
          <span className="ml-auto text-xs text-(--color-muted)">
            Önceki tur: {formatNumber(last.doneCount)} ürün, {formatSpan(last.durationMs)}
          </span>
        )}
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded bg-(--color-border)"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} #${pass.passNo} ilerlemesi`}
      >
        <div className="h-full bg-(--color-accent)" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
