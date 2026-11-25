/**
 * The seller's address as a person writes it (review 2026-11-25).
 *
 * The seller page states the address as labelled fields run together —
 * `Mahalle/Semt:MERKEZ MAH. Cadde/Sokak:ATATÜRK CAD. Kapı No:12 İlçe:ÇANKAYA`. Display only: the
 * stored value is untouched, and an address that does not carry these labels is returned as it is.
 *
 * Labels that only name the part (mahalle, cadde, ilçe) are dropped; labels a number cannot do
 * without (kapı no, daire no) are kept, without the colon.
 */
const DROPPED = ['Mahalle/Semt', 'Cadde/Sokak', 'İlçe', 'İl'];
const KEPT = ['Dış Kapı No', 'İç Kapı No', 'Kapı No', 'Daire No', 'Bina No', 'Posta Kodu'];

export function formatIdentityAddress(address: string | null): string | null {
  if (address === null) return null;
  if (!/(Mahalle\/Semt|Cadde\/Sokak):/.test(address)) return address;

  // Longest first, so "Dış Kapı No" is not read as "Kapı No".
  const labels = [...DROPPED, ...KEPT].sort((a, b) => b.length - a.length);
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  const pattern = new RegExp(`(?:^|\\s)(${escaped.join('|')}):\\s*`, 'g');

  const parts: string[] = [];
  let lastLabel: string | null = null;
  let lastIndex = 0;
  for (const match of address.matchAll(pattern)) {
    if (lastLabel !== null || match.index! > 0) push(address.slice(lastIndex, match.index), lastLabel);
    lastLabel = match[1]!;
    lastIndex = match.index! + match[0].length;
  }
  push(address.slice(lastIndex), lastLabel);
  return parts.join(', ');

  function push(value: string, label: string | null) {
    const text = value.trim();
    if (text === '') return;
    parts.push(label !== null && KEPT.includes(label) ? `${label} ${text}` : text);
  }
}
