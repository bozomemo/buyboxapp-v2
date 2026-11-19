import { NextResponse } from 'next/server';
import { invalidBody, readJsonBody } from '@/lib/server/request-body';
import { withPermission } from '@/lib/server/auth/guard';
import { resolveCredentials, testMarketplaceConnection } from '@/lib/server/marketplace-connection';

/**
 * "Bağlantıyı Test Et": the credentials the operator typed over what is stored (an untouched form
 * tests what the jobs use — `@/lib/credential-merge`), through the same test the save routes run.
 */
async function postHandler(request: Request) {
  const body = await readJsonBody<{
    marketplaceCode: 'trendyol' | 'hepsiburada';
    credentials: Record<string, string>;
  }>(request);
  if (body === null) return invalidBody();

  try {
    // Inside the try: reading the secret store can fail (no key, unreadable file), and the
    // client renders `message` — an unhandled 500 here would show as a blank result.
    const credentials = await resolveCredentials(body.marketplaceCode, body.credentials);
    return NextResponse.json(await testMarketplaceConnection(body.marketplaceCode, credentials));
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
}

export const POST = withPermission('settings.manage', postHandler, { allowSetupAccess: true });
