'use client';

import { useState } from 'react';
import { formatDateTime, formatMoney } from '@/lib/format';
import { chartScale, lineSegments, snapIndex, xPercent, yPercent } from '@/lib/price-chart-series';

/**
 * The price chart both detail screens draw (doc 06 §5 "price chart over time", §12.2) — still
 * dependency-free SVG, now readable point by point: hovering anywhere over the plot snaps to the
 * nearest observation and shows that look's prices, its rank and who held the buybox, on the
 * breakpoint itself (customer feedback 2026-09-03).
 *
 * Two things shape the implementation:
 *
 * - **The plot is drawn in an unscaled viewBox, the furniture is not.** Stretching a 600×120
 *   viewBox to the panel's width (`preserveAspectRatio="none"`) is what lets the line fill the
 *   panel at any size, but it would stretch a marker circle into an ellipse and smear a label
 *   with it. So only the polylines live in the SVG; markers, the guide line and the readout are
 *   HTML positioned in percentages over it, and stay round and legible at any width.
 * - **A gap is a gap.** A series with no observation at a point is broken into separate segments
 *   rather than bridged, and contributes no marker there: a scrape that failed must not read as a
 *   straight line through the missing hours.
 */

export interface ChartSeries {
  readonly key: string;
  /** Legend and readout label. */
  readonly label: string;
  /** Colour token — `var(--color-…)` only, never a literal (doc 06 §11.1). */
  readonly color: string;
  /** Kuruş per timestamp; `null` where this series has no value at that look. */
  readonly values: readonly (bigint | null)[];
  /** Drawn dashed — for a reference level (our own price) rather than an observed series. */
  readonly dashed?: boolean;
}

/** A non-money fact shown in the readout for the hovered look — seller name, rank, status. */
export interface ChartAnnotation {
  readonly label: string;
  readonly values: readonly (string | null)[];
}

const WIDTH = 600;
const HEIGHT = 120;

export function PriceChart({
  timestamps,
  series,
  annotations = [],
  emptyMessage = 'Grafik için yeterli veri yok.',
}: {
  timestamps: readonly number[];
  series: readonly ChartSeries[];
  annotations?: readonly ChartAnnotation[];
  emptyMessage?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const n = timestamps.length;
  // The dashed reference level (our own price) counts towards the scale but not towards having
  // something to plot: two *observed* points are the threshold, or there is no history to show.
  const observed = series.filter((s) => !s.dashed).flatMap((s) => s.values.filter((v) => v !== null));
  const scale = chartScale(series.map((s) => s.values));
  if (n < 2 || observed.length < 2 || scale === null)
    return <p className="text-xs text-(--color-muted)">{emptyMessage}</p>;

  const x = (i: number) => xPercent(i, n);
  const y = (v: bigint) => yPercent(v, scale);

  const move = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    // A zero-width element (the first paint of a hidden panel) would make this NaN; `snapIndex`
    // clamps it rather than indexing the arrays with it.
    setHover(snapIndex((clientX - rect.left) / rect.width, n));
  };

  const active = hover;
  // The readout flips to the left of the guide past the midpoint so it never leaves the panel.
  const flip = active !== null && x(active) > 55;

  return (
    <div>
      <div
        className="relative h-32 w-full cursor-crosshair"
        role="img"
        aria-label="Fiyat geçmişi grafiği"
        tabIndex={0}
        onMouseMove={(e) => move(e.clientX, e.currentTarget)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => move(e.touches[0]!.clientX, e.currentTarget)}
        onTouchMove={(e) => move(e.touches[0]!.clientX, e.currentTarget)}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n - 1) - 1));
          else if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? 0) + 1));
          else if (e.key === 'Escape') setHover(null);
          else return;
          e.preventDefault();
        }}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-full w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {series.map((s) =>
            lineSegments(s.values, scale, WIDTH, HEIGHT).map((points, i) => (
              <polyline
                key={`${s.key}-${i}`}
                points={points}
                fill="none"
                stroke={s.color}
                strokeWidth={s.dashed ? 1.5 : 2}
                strokeDasharray={s.dashed ? '4 3' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            )),
          )}
        </svg>

        {/* The breakpoints themselves, drawn only while they are far enough apart to read as
            points rather than as a thickened line. The hovered one is always drawn, below. */}
        {n <= 60 &&
          series
            .filter((s) => !s.dashed)
            .flatMap((s) =>
              s.values.map((v, i) =>
                v === null ? null : (
                  <span
                    key={`${s.key}-dot-${i}`}
                    className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
                    style={{ left: `${x(i)}%`, top: `${y(v)}%`, background: s.color }}
                  />
                ),
              ),
            )}

        {active !== null && (
          <>
            <span
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-(--color-border)"
              style={{ left: `${x(active)}%` }}
            />
            {series.map((s) => {
              const v = s.values[active];
              if (v === null || v === undefined) return null;
              return (
                <span
                  key={`${s.key}-marker`}
                  className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-(--color-surface)"
                  style={{ left: `${x(active)}%`, top: `${y(v)}%`, background: s.color }}
                />
              );
            })}
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-40 rounded border border-(--color-border) bg-(--color-surface) px-2 py-1 text-xs shadow-lg"
              style={
                flip ? { right: `calc(${100 - x(active)}% + 8px)` } : { left: `calc(${x(active)}% + 8px)` }
              }
            >
              <div className="mb-1 text-(--color-muted)">{formatDateTime(timestamps[active]!)}</div>
              {series.map((s) => (
                <div key={`${s.key}-row`} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: s.color }}
                      aria-hidden="true"
                    />
                    {s.label}
                  </span>
                  <span className="tabular-nums">{formatMoney(s.values[active] ?? null)}</span>
                </div>
              ))}
              {annotations.map((a) => (
                <div key={a.label} className="flex items-center justify-between gap-3">
                  <span className="text-(--color-muted)">{a.label}</span>
                  <span>{a.values[active] ?? '—'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-1 flex flex-wrap gap-3 text-xs text-(--color-muted)">
        {series.map((s) => (
          <span key={`${s.key}-legend`} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: s.color }}
              aria-hidden="true"
            />
            {s.label}
          </span>
        ))}
        <span>· imleci grafiğin üzerine getirin (ok tuşlarıyla da gezilebilir)</span>
      </div>
    </div>
  );
}
