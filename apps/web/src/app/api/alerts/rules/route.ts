/**
 * Alert rule management (doc 06 §9, doc 12 Phase 10C). Operator-owned, so every change is
 * audited like any other setting.
 *
 * Validation here is deliberately strict about **targets that do not exist**. The failure mode
 * of an alert rule is not a crash, it is silence: a rule naming a mistyped stock code or a
 * seller we have never seen saves cleanly, appears in the list, and simply never fires. The
 * operator then reads "no alerts" as "no problem". Every reference is therefore resolved before
 * the rule is stored, and a rule that cannot fire is refused with a reason.
 */
import { NextResponse } from 'next/server';
import {
  alertsRepo,
  competitorSellersRepo,
  configRepo,
  listingsRepo,
  newId,
  stockRepo,
} from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

const SCOPE_TYPES = ['listing', 'baseStockCode', 'marketplace', 'all'] as const;
const SUBJECT_TYPES = ['seller', 'sellerGroup', 'any'] as const;
const PREDICATES = ['sellerPresent', 'priceBelow'] as const;
const THRESHOLD_TYPES = ['fixed', 'belowOurPrice', 'belowFloor', 'pctBelowOurs'] as const;

/** One year. Not a policy limit — a units check, since a quiet period is milliseconds. */
const MAX_QUIET_PERIOD_MS = 365 * 24 * 60 * 60_000;

interface RuleBody {
  readonly id?: string;
  readonly name: string;
  readonly scopeType: (typeof SCOPE_TYPES)[number];
  readonly scopeValue: string | null;
  readonly subjectType: (typeof SUBJECT_TYPES)[number];
  readonly subjectValue: string | null;
  readonly predicate: (typeof PREDICATES)[number];
  readonly thresholdType: (typeof THRESHOLD_TYPES)[number];
  /** Kuruş, as a digit string on the wire — money is `bigint` and never a JS number. */
  readonly thresholdValue: string | null;
  readonly thresholdPct: number | null;
  readonly quietPeriodMs: number;
  readonly enabled: boolean;
}

/**
 * Kuruş off the wire. `BigInt('12.5')` throws and `BigInt('')` is `0n`, so neither can be
 * trusted with an operator-supplied string; only digits are accepted.
 */
function parseKurus(value: string): bigint | null {
  if (!/^\d+$/.test(value.trim())) return null;
  return BigInt(value.trim());
}

/** Shape and range only — nothing here touches the database. */
function validateShape(body: RuleBody): string | null {
  if (!body.name?.trim()) return 'Kural adı boş olamaz.';
  if (body.name.trim().length > 200) return 'Kural adı en fazla 200 karakter olabilir.';
  if (!SCOPE_TYPES.includes(body.scopeType)) return 'Geçersiz kapsam.';
  if (!SUBJECT_TYPES.includes(body.subjectType)) return 'Geçersiz özne.';
  if (!PREDICATES.includes(body.predicate)) return 'Geçersiz koşul.';
  if (!THRESHOLD_TYPES.includes(body.thresholdType)) return 'Geçersiz eşik türü.';
  if (body.scopeType !== 'all' && !body.scopeValue) return 'Bu kapsam için bir hedef seçmelisiniz.';
  if (body.subjectType !== 'any' && !body.subjectValue) return 'Bu özne için bir satıcı seçmelisiniz.';

  if (body.predicate === 'priceBelow') {
    if (body.thresholdType === 'fixed') {
      const kurus = body.thresholdValue === null ? null : parseKurus(body.thresholdValue);
      if (kurus === null) return 'Sabit eşik için geçerli bir fiyat girmelisiniz.';
      // A zero threshold can never be undercut, so the rule would be permanently silent.
      if (kurus <= 0n) return 'Sabit eşik sıfırdan büyük olmalıdır.';
    }
    if (
      body.thresholdType === 'pctBelowOurs' &&
      (typeof body.thresholdPct !== 'number' ||
        !Number.isFinite(body.thresholdPct) ||
        body.thresholdPct <= 0 ||
        body.thresholdPct >= 100)
    ) {
      return 'Yüzde eşiği 1 ile 99 arasında olmalıdır.';
    }
  }

  if (!Number.isFinite(body.quietPeriodMs) || body.quietPeriodMs < 0) {
    return 'Sessizlik süresi negatif olamaz.';
  }
  if (body.quietPeriodMs > MAX_QUIET_PERIOD_MS) {
    return 'Sessizlik süresi en fazla 365 gün olabilir.';
  }
  return null;
}

/**
 * Resolves every reference the rule makes. A rule that names something absent cannot fire, and
 * a rule that cannot fire must not be storable — that is the difference between "no alerts
 * because nothing is wrong" and "no alerts because the rule was never going to match".
 */
async function validateTargets(
  appDb: ReturnType<typeof getAppDb>,
  body: RuleBody,
): Promise<string | null> {
  if (body.scopeType === 'listing') {
    const listing = await listingsRepo.getListing(appDb, body.scopeValue!);
    if (!listing) return 'Seçilen ilan bulunamadı.';
  }

  if (body.scopeType === 'marketplace') {
    const marketplaces = await configRepo.listMarketplaces(appDb);
    if (!marketplaces.some((m) => m.code === body.scopeValue)) {
      return 'Seçilen pazaryeri bulunamadı.';
    }
  }

  if (body.scopeType === 'baseStockCode') {
    const stockItem = await stockRepo.getStockItem(appDb, body.scopeValue!);
    if (!stockItem) return `"${body.scopeValue}" stok kodu bulunamadı.`;
  }

  if (body.subjectType === 'sellerGroup') {
    const groups = await competitorSellersRepo.listSellerGroups(appDb);
    if (!groups.some((g) => g.id === body.subjectValue)) return 'Seçilen satıcı grubu bulunamadı.';
  }

  if (body.subjectType === 'seller') {
    const matching = (await competitorSellersRepo.listCompetitorSellers(appDb)).filter(
      (s) => s.sellerRef === body.subjectValue,
    );
    if (matching.length === 0) {
      return 'Bu satıcı henüz hiçbir taramada görülmedi. Bir tarama çalıştıktan sonra tekrar deneyin.';
    }
    // A seller ref is a marketplace's own id, so the same digits can belong to two unrelated
    // companies. The evaluator matches an offer by ref alone, so an unbounded rule would fire
    // on the wrong company on the other marketplace — and look like it was working. Bounding
    // the scope to one marketplace (or to a single listing, which is on one) removes the
    // ambiguity; asserting that the two *are* one company is what a seller group is for.
    const marketplaces = new Set(matching.map((s) => s.marketplaceCode));
    const scopeBoundsMarketplace = body.scopeType === 'marketplace' || body.scopeType === 'listing';
    if (marketplaces.size > 1 && !scopeBoundsMarketplace) {
      return (
        `"${body.subjectValue}" satıcı kodu birden fazla pazaryerinde (${[...marketplaces].join(', ')}) ` +
        'kayıtlı ve aynı firma oldukları kesin değil. Kuralın kapsamını tek bir pazaryeri ya da tek ' +
        'bir ilan olarak seçin, ya da bu satıcıları bir satıcı grubunda birleştirip grubu hedefleyin.'
      );
    }
    if (body.scopeType === 'marketplace' && !marketplaces.has(body.scopeValue!)) {
      return `Bu satıcı "${body.scopeValue}" pazaryerinde görülmedi; kural hiçbir zaman çalışmaz.`;
    }
  }

  return null;
}

export async function POST(request: Request) {
  let body: RuleBody;
  try {
    body = (await request.json()) as RuleBody;
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 });
  }

  const shapeError = validateShape(body);
  if (shapeError) return NextResponse.json({ error: shapeError }, { status: 400 });

  const appDb = getAppDb();
  const targetError = await validateTargets(appDb, body);
  if (targetError) return NextResponse.json({ error: targetError }, { status: 400 });

  const nowMs = Date.now();
  const id = body.id ?? newId();
  const existing = body.id
    ? (await alertsRepo.listAlertRules(appDb)).find((r) => r.id === body.id)
    : undefined;
  if (body.id && !existing) {
    return NextResponse.json({ error: 'Güncellenecek kural bulunamadı.' }, { status: 404 });
  }

  // A presence rule has no threshold. Storing whatever the form last held would leave a value
  // the rule does not use sitting in the row, where the next reader takes it for the truth.
  const usesThreshold = body.predicate === 'priceBelow';

  await alertsRepo.upsertAlertRule(appDb, {
    id,
    name: body.name.trim(),
    scopeType: body.scopeType,
    scopeValue: body.scopeType === 'all' ? null : body.scopeValue,
    subjectType: body.subjectType,
    subjectValue: body.subjectType === 'any' ? null : body.subjectValue,
    predicate: body.predicate,
    thresholdType: body.thresholdType,
    thresholdValue:
      usesThreshold && body.thresholdType === 'fixed' && body.thresholdValue
        ? parseKurus(body.thresholdValue)
        : null,
    thresholdPct: usesThreshold && body.thresholdType === 'pctBelowOurs' ? body.thresholdPct : null,
    quietPeriodMs: body.quietPeriodMs,
    enabled: body.enabled,
    createdAt: existing?.createdAt ?? nowMs,
    updatedAt: nowMs,
  });

  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'alert_rules',
    entityId: id,
    field: existing ? 'update' : 'create',
    oldValue: existing
      ? JSON.stringify({ ...existing, thresholdValue: existing.thresholdValue?.toString() ?? null })
      : null,
    newValue: JSON.stringify({ ...body, id }),
    changedBy: 'operator',
    changedAt: nowMs,
  });

  return NextResponse.json({ ok: true, id });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli.' }, { status: 400 });

  const appDb = getAppDb();
  // Alerts cascade with the rule: an alert whose rule no longer exists cannot be explained,
  // re-evaluated or acted on, so keeping it would leave rows nothing can ever resolve.
  await alertsRepo.deleteAlertRule(appDb, id);
  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'alert_rules',
    entityId: id,
    field: 'delete',
    oldValue: id,
    newValue: null,
    changedBy: 'operator',
    changedAt: Date.now(),
  });
  return NextResponse.json({ ok: true });
}
