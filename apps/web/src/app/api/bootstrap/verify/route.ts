/**
 * Exchanges the setup token for setup access (doc 18 §8.1): a short-lived, strict, httpOnly
 * cookie holding the token, checked against the file on every request that needs it.
 *
 * Five wrong tokens from one address lock the form for 15 minutes. The count is kept in memory:
 * bootstrap happens once per install, the token is 100 random bits, and a restart that clears
 * the count also regenerates the token.
 */
import { NextResponse } from 'next/server';
import { AUTH_LOCKOUT_ATTEMPTS, AUTH_LOCKOUT_WINDOW_MS } from '@buybox/shared';
import { cookieOptions, getCookieNames, requestMeta } from '@/lib/server/auth/config';
import { isBootstrapMode, isValidSetupToken } from '@/lib/server/auth/bootstrap';
import { readJsonObject } from '@/lib/server/request-body';

/** One hour: long enough for the database step and the admin form, not long enough to forget. */
const SETUP_ACCESS_MS = 60 * 60 * 1000;

declare global {
  var __buyboxSetupTokenFailures: Map<string, number[]> | undefined;
}

function failures(): Map<string, number[]> {
  globalThis.__buyboxSetupTokenFailures ??= new Map();
  return globalThis.__buyboxSetupTokenFailures;
}

export async function POST(request: Request) {
  if (!(await isBootstrapMode())) {
    return NextResponse.json({ error: 'not_bootstrap', message: 'Bu kurulumda zaten bir yönetici var.' }, { status: 409 });
  }
  const body = await readJsonObject(request);
  if (body === null || typeof body.token !== 'string') {
    return NextResponse.json({ error: 'Kurulum anahtarı gerekli.' }, { status: 400 });
  }

  // Without a trusted proxy there is no per-client address; everyone shares one bucket, which
  // on a loopback install is exactly one person anyway.
  const key = requestMeta(request.headers).ip ?? 'local';
  const nowMs = Date.now();
  const recent = (failures().get(key) ?? []).filter((at) => at > nowMs - AUTH_LOCKOUT_WINDOW_MS);
  if (recent.length >= AUTH_LOCKOUT_ATTEMPTS) {
    return NextResponse.json(
      { error: 'locked', message: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.' },
      { status: 429 },
    );
  }

  if (!(await isValidSetupToken(body.token))) {
    failures().set(key, [...recent, nowMs]);
    return NextResponse.json({ error: 'invalid_token', message: 'Kurulum anahtarı hatalı.' }, { status: 401 });
  }

  failures().delete(key);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getCookieNames().setup, body.token.trim(), cookieOptions(SETUP_ACCESS_MS, 'strict'));
  return response;
}
