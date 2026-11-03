/**
 * WCAG 2.x contrast ratio between two opaque `#rrggbb` colours, used by the theme-token test to
 * hold `globals.css` to its own contrast rules (spec 2026-11-03-ui-redesign §3.4). Translucent
 * values are rejected rather than guessed at: their contrast depends on what they sit on.
 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  return 0.2126 * channel(m[1]) + 0.7152 * channel(m[2]) + 0.0722 * channel(m[3]);
}

function channel(hex: string | undefined): number {
  const c = parseInt(hex ?? '0', 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
