/**
 * Audit findings for one brand (doc 06 §12.4, Faz 6).
 *
 * Gathers facts and hands them to `deriveAuditFindings`, which decides. Nothing here judges
 * anything: the split is deliberate and is what lets every rule be table-tested without a
 * database (`packages/core/src/brand/audit-findings.ts`).
 *
 * ## One brand at a time, on purpose
 *
 * Two of the eight signals are policy signals, and a policy verdict is only meaningful for one
 * brand — the same firm is routinely Whiskas' authorised distributor and unknown for Royal
 * Canin. A group-wide findings list would have to pick one of those answers per seller and would
 * be wrong about the other. The screen therefore asks for a brand, and this route says so
 * rather than guessing, except in the one case where there is nothing to guess: an install that
 * watches exactly one brand.
 *
 * ## The gathering is shared with the cadence job
 *
 * Since 2026-09-03 the facts are collected by `collectBrandFindings` in `packages/jobs`, which
 * `EvaluateBrandFindings` also calls. This route is the *pull* — an operator asking now, with
 * their own window — and the job is the *push*. Two copies of that orchestration would drift,
 * and the first symptom would be an alert nobody could reproduce on the screen.
 */
import { NextResponse } from 'next/server';
import { collectBrandFindings } from '@buybox/jobs';
import { brandFindingsRepo, watchedBrandsRepo } from '@buybox/db';
import { readAuditThresholds } from '@/lib/server/audit-thresholds';
import { getAppDb } from '@/lib/server/db';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const appDb = getAppDb();
  const nowMs = Date.now();

  const untilMs = params.get('untilMs') ? Number(params.get('untilMs')) : nowMs;
  const sinceMs = params.get('sinceMs') ? Number(params.get('sinceMs')) : untilMs - DEFAULT_WINDOW_MS;

  const [groups, brands, { thresholds, isDefault }] = await Promise.all([
    watchedBrandsRepo.listWatchedBrandGroups(appDb),
    // Own brands only: a competitor's brand is watched for price comparison, and every `stated`
    // signal on this screen is a statement about *our* distribution agreements. Offering a rival
    // in the brand picker would invite an audit that is wrong in kind (see the job's comment).
    watchedBrandsRepo.listWatchedBrands(appDb, { ownOnly: true }),
    readAuditThresholds(),
  ]);

  const requestedBrandId = params.get('watchedBrandId') ?? undefined;
  const brand =
    requestedBrandId !== undefined
      ? brands.find((b) => b.id === requestedBrandId)
      : brands.length === 1
        ? brands[0]
        : undefined;

  const catalogue = {
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    brands: brands.map((b) => ({
      id: b.id,
      groupId: b.groupId,
      label: b.label,
      marketplaceCode: b.marketplaceCode,
    })),
    thresholds,
    thresholdsAreDefault: isDefault,
  };

  if (brand === undefined) {
    // Not an error and not an empty list — either would read as "nothing found". The screen
    // asks for a brand instead.
    return NextResponse.json({ ...catalogue, brand: null, findings: [], needsBrand: true });
  }

  const [{ findings, context }, tracked] = await Promise.all([
    collectBrandFindings(appDb, { brand, sinceMs, untilMs, thresholds }),
    brandFindingsRepo.openFindings(appDb, brand.id),
  ]);

  /**
   * When the cadence job first saw each finding, and whether anyone has been told.
   *
   * The findings themselves are recomputed here from the archive, as they always were — so this
   * screen still re-answers the whole history when a threshold moves. What the stored rows add
   * is the one thing derivation cannot know: *since when*. An operator working through a list
   * needs to tell "this appeared overnight" from "this has been here for three weeks", and both
   * render identically without it.
   *
   * A finding with no stored row is one the job has not evaluated yet — the operator has simply
   * arrived first, which is normal on a screen that computes on demand. It shows no date rather
   * than today's.
   */
  const trackedByKey = new Map(tracked.map((row) => [row.findingKey, row]));

  return NextResponse.json({
    ...catalogue,
    brand: { id: brand.id, label: brand.label, marketplaceCode: brand.marketplaceCode },
    filters: { sinceMs, untilMs },
    findings: findings.map((finding) => ({
      ...finding,
      // `openedAt`, not `firstSeenAt`: the `newSeller` finding already carries a `firstSeenAt`
      // meaning "when the seller was first observed", and two different dates under one name on
      // the same object is exactly the confusion a screen renders wrongly without failing.
      openedAt: trackedByKey.get(finding.id)?.firstSeenAt ?? null,
      notifiedAt: trackedByKey.get(finding.id)?.notifiedAt ?? null,
    })),
    needsBrand: false,
    /**
     * What the screen has to say about itself — every field of it exists to stop a silence from
     * being misread. Built by `collectBrandFindings` so the cadence job and this screen report
     * the same caveats about the same run.
     */
    context,
    /**
     * Whether this install has somewhere to push a new finding, and nothing else about it.
     *
     * A boolean, never the URL: a webhook address is a bearer token, which is why it lives in
     * the environment rather than in a settings row (CLAUDE.md), and a screen that displayed it
     * would put it in every screenshot and browser cache. The screen needs only to be able to
     * say "nobody is being told about these" — which is worth saying, because an audit list
     * nobody is notified about looks exactly like one nobody needed to be.
     */
    notificationsConfigured: Boolean(process.env.FINDINGS_WEBHOOK_URL),
  });
}
