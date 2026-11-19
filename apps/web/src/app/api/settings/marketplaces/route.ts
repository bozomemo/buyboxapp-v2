/** Settings > Marketplaces (doc 06 §9): list + save, with credentials write-only and every change audited. */
import { NextResponse } from 'next/server';
import { configRepo, newId } from '@buybox/db';
import { marketplaceCredentialsKey } from '@buybox/shared';
import { getAppDb } from '@/lib/server/db';
import { getSecretStore } from '@/lib/server/secrets';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission, type AuthContext } from '@/lib/server/auth/guard';
import { mergeCredentials } from '@/lib/credential-merge';
import { credentialsChanged, storedCredentials, testMarketplaceConnection } from '@/lib/server/marketplace-connection';

const TITLES: Record<string, string> = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' };

async function getHandler(request: Request, _context: unknown, auth: AuthContext) {
  const appDb = getAppDb();
  const marketplaces = await configRepo.listMarketplaces(appDb);
  return NextResponse.json({
    marketplaces: await Promise.all(
      marketplaces.map(async (m) => ({
        code: m.code,
        displayName: m.displayName,
        enabled: m.enabled,
        merchantRef: m.merchantRef,
        updatedAt: m.updatedAt,
        environment: await storedEnvironment(m.code),
      })),
    ),
  });
}

/**
 * Prod or Test, read from the credentials record — the one field of it that is not a secret.
 * The screen showed "Prod" for every install because it was never sent (2026-11-19). Nothing
 * else in the record leaves the store. `null` when nothing is stored (or the store cannot be
 * read): the screen then sends no environment back, so saving an untouched form cannot create a
 * credentials record that holds an environment and no credentials.
 */
async function storedEnvironment(code: string): Promise<string | null> {
  try {
    const raw = await getSecretStore().get(marketplaceCredentialsKey(code));
    if (!raw) return null;
    const environment = (JSON.parse(raw) as { environment?: unknown }).environment;
    return typeof environment === 'string' && environment !== '' ? environment : 'production';
  } catch {
    return null;
  }
}

async function postHandler(request: Request, _context: unknown, auth: AuthContext) {
  const body = await readJsonBody<{
    code: 'trendyol' | 'hepsiburada';
    enabled: boolean;
    credentials?: Record<string, string>;
  }>(request);
  if (body === null) return invalidBody();

  // Credentials that fail their test are not saved (product owner, 2026-11-19) — and nothing
  // else in the request is either. Only a change is tested: switching a marketplace off must
  // never depend on the marketplace answering.
  const stored = await storedCredentials(body.code);
  const merged = mergeCredentials(stored, body.credentials);
  const changed = credentialsChanged(stored, merged);
  if (changed) {
    const verdict = await testMarketplaceConnection(body.code, merged);
    if (!verdict.ok) return NextResponse.json({ ok: false, error: verdict.message }, { status: 400 });
  }

  const appDb = getAppDb();
  const nowMs = Date.now();
  const previous = await configRepo.getMarketplace(appDb, body.code);

  await configRepo.upsertMarketplace(appDb, {
    code: body.code,
    displayName: TITLES[body.code] ?? body.code,
    enabled: body.enabled,
    // Never taken from the request. Our own seller id is derived from the credentials the
    // adapter authenticates with and refreshed by `ImportListings` (doc 05 §3): accepting it
    // here would reopen the drift this screen used to cause, where a hand-typed value silently
    // disabled every own-offer filter downstream.
    merchantRef: previous?.merchantRef ?? null,
    createdAt: previous?.createdAt ?? nowMs,
    updatedAt: nowMs,
  });

  await configRepo.recordSettingsAudit(appDb, {
    id: newId(),
    entity: 'marketplaces',
    entityId: body.code,
    field: 'enabled',
    oldValue: previous ? JSON.stringify({ enabled: previous.enabled }) : null,
    newValue: JSON.stringify({ enabled: body.enabled }),
    changedBy: auth.actor,
    changedAt: nowMs,
  });

  // Credentials never touch the app database (CLAUDE.md hard rule) — secret store only, and
  // only rewritten when the operator actually entered something. Merged field-by-field with
  // whatever is already stored: an empty field (e.g. leaving password blank while only
  // switching environment) must keep its existing value, not blank it — a blind overwrite of
  // the whole blob would silently destroy credentials nobody meant to touch.
  if (changed) {
    await getSecretStore().set(marketplaceCredentialsKey(body.code), JSON.stringify(merged));
  }

  return NextResponse.json({ ok: true });
}

export const GET = withPermission('view', getHandler);
export const POST = withPermission('settings.manage', postHandler);
