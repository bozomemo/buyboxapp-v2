/**
 * Bootstrap status for `/bootstrap` (doc 18 §8.1): whether the install is in bootstrap mode,
 * whether a database exists yet, whether this browser already holds setup access, and **where**
 * the token file is. Never the token itself.
 */
import { NextResponse } from 'next/server';
import { isBootstrapped } from '@/lib/server/db';
import { getCookieNames } from '@/lib/server/auth/config';
import { readCookie } from '@/lib/server/auth/current';
import { ensureSetupToken, isBootstrapMode, isValidSetupToken, setupTokenPath } from '@/lib/server/auth/bootstrap';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const bootstrapMode = await isBootstrapMode();
  if (!bootstrapMode) return NextResponse.json({ bootstrapMode: false });

  // Lazily as well as at boot: a database switched to an empty one mid-run enters bootstrap
  // mode without a restart, and must still have a token to leave it with.
  await ensureSetupToken();
  const setupCookie = readCookie(request.headers, getCookieNames().setup);
  return NextResponse.json({
    bootstrapMode: true,
    databaseConfigured: isBootstrapped(),
    hasSetupAccess: await isValidSetupToken(setupCookie),
    tokenPath: setupTokenPath(),
  });
}
