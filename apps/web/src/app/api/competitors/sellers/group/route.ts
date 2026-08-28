/**
 * Operator-asserted seller identity (doc 05 §5, doc 06 §9).
 *
 * This is the one thing in the competitor archive no automatic process can reproduce, so every
 * change is audited like any other setting. Linking is **never** inferred from a matching name:
 * a wrong merge makes an alert fire on the wrong company while still looking like it works.
 */
import { NextResponse } from 'next/server';
import { competitorSellersRepo, configRepo, newId, sellerPoliciesRepo } from '@buybox/db';
import { getAppDb } from '@/lib/server/db';

interface CreateGroupBody {
  readonly action: 'createGroup';
  readonly displayName: string;
  readonly note?: string | null;
}

interface AssignBody {
  readonly action: 'assign';
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  /** `null` unlinks the seller from whatever group it is in. */
  readonly groupId: string | null;
}

interface NoteBody {
  readonly action: 'note';
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly operatorNote: string | null;
}

interface DeleteGroupBody {
  readonly action: 'deleteGroup';
  readonly groupId: string;
}

/**
 * The firm behind a marketplace storefront (Faz 5), recorded here because it is the same kind
 * of thing as the group and the note beside it: an operator assertion no scrape can reproduce,
 * about a seller's identity rather than its behaviour.
 *
 * It matters because seller **policy** is asked of a firm, not a storefront — one company can
 * hold several seller accounts, and a rule written against a tax number follows it across them.
 */
interface TaxNumberBody {
  readonly action: 'taxNumber';
  readonly marketplaceCode: string;
  readonly sellerRef: string;
  readonly taxNumber: string | null;
}

type Body = CreateGroupBody | AssignBody | NoteBody | DeleteGroupBody | TaxNumberBody;

async function audit(
  appDb: ReturnType<typeof getAppDb>,
  entityId: string,
  oldValue: string | null,
  newValue: string | null,
  // Named rather than assumed: this helper used to hardcode `group`, which was right while that
  // was the only thing it audited and would have filed every tax-number change under the wrong
  // field the moment a second one arrived.
  field: 'group' | 'taxNumber' = 'group',
): Promise<void> {
  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'competitor_sellers',
    entityId,
    field,
    oldValue,
    newValue,
    changedBy: 'operator',
    changedAt: Date.now(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const appDb = getAppDb();

  if (body.action === 'createGroup') {
    const displayName = body.displayName?.trim();
    if (!displayName) {
      return NextResponse.json({ error: 'Grup adı boş olamaz.' }, { status: 400 });
    }
    const now = Date.now();
    const id = newId();
    await competitorSellersRepo.upsertSellerGroup(appDb, {
      id,
      displayName,
      note: body.note ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await audit(appDb, id, null, displayName);
    return NextResponse.json({ ok: true, groupId: id });
  }

  if (body.action === 'assign') {
    const seller = await competitorSellersRepo.getCompetitorSeller(
      appDb,
      body.marketplaceCode,
      body.sellerRef,
    );
    if (!seller) {
      // The seller has never been recorded by a scrape, so there is nothing durable to attach
      // the assertion to. Reported rather than silently created: a group member invented here
      // would carry no first-seen evidence.
      return NextResponse.json(
        { error: 'Bu satıcı henüz kaydedilmemiş. Bir tarama çalıştıktan sonra tekrar deneyin.' },
        { status: 404 },
      );
    }
    await competitorSellersRepo.setSellerGroup(appDb, seller.id, body.groupId);
    await audit(appDb, seller.id, seller.groupId, body.groupId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'note') {
    const seller = await competitorSellersRepo.getCompetitorSeller(
      appDb,
      body.marketplaceCode,
      body.sellerRef,
    );
    if (!seller) {
      return NextResponse.json(
        { error: 'Bu satıcı henüz kaydedilmemiş. Bir tarama çalıştıktan sonra tekrar deneyin.' },
        { status: 404 },
      );
    }
    await competitorSellersRepo.setSellerNote(appDb, seller.id, body.operatorNote);
    await audit(appDb, seller.id, seller.operatorNote, body.operatorNote);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'taxNumber') {
    const seller = await competitorSellersRepo.getCompetitorSeller(
      appDb,
      body.marketplaceCode,
      body.sellerRef,
    );
    if (!seller) {
      return NextResponse.json(
        { error: 'Bu satıcı henüz kaydedilmemiş. Bir tarama çalıştıktan sonra tekrar deneyin.' },
        { status: 404 },
      );
    }
    await sellerPoliciesRepo.setSellerTaxNumber(
      appDb,
      { marketplaceCode: body.marketplaceCode, sellerRef: body.sellerRef },
      body.taxNumber,
    );
    await audit(appDb, seller.id, seller.taxNumber, body.taxNumber, 'taxNumber');
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'deleteGroup') {
    // Members are unlinked, not deleted (`on delete set null`): the sellers are observed facts,
    // the grouping is an opinion, and withdrawing the opinion must not erase the evidence.
    await competitorSellersRepo.deleteSellerGroup(appDb, body.groupId);
    await audit(appDb, body.groupId, body.groupId, null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Bilinmeyen işlem.' }, { status: 400 });
}
