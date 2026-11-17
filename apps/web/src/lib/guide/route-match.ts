/**
 * Which guide topic documents the screen at `pathname` (doc 19 §6), for the header's "?" link.
 * Segment by segment: a `[x]` segment matches any one non-empty segment, the segment count must
 * be equal, and the pattern with the fewest dynamic segments wins — so `/x/new` beats `/x/[id]`.
 */
export function topicIdForPath(
  pathname: string,
  topics: readonly { readonly id: string; readonly routes: readonly string[] }[],
): string | null {
  const path = pathname.split('/').filter(Boolean);
  let best: { id: string; dynamic: number } | null = null;
  for (const topic of topics) {
    for (const route of topic.routes) {
      const pattern = route.split('/').filter(Boolean);
      if (pattern.length !== path.length) continue;
      let dynamic = 0;
      const ok = pattern.every((seg, i) => {
        if (/^\[.+\]$/.test(seg)) {
          dynamic += 1;
          return true;
        }
        return seg === path[i];
      });
      if (ok && (best === null || dynamic < best.dynamic)) best = { id: topic.id, dynamic };
    }
  }
  return best?.id ?? null;
}
