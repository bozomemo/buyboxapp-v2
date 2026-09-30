import { safeNextPath } from '@/lib/auth-access';
import { LoginClient } from './login-client';

/** doc 06 §10.1. Dynamic: it must never be served from a build-time cache. */
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginClient next={safeNextPath(next)} />;
}
