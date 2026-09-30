import { safeNextPath } from '@/lib/auth-access';
import { MfaChallengeClient } from './mfa-challenge-client';

/**
 * doc 06 §10.1, the second step of signing in. Public like `/login`: the challenge cookie the
 * password step set is the only thing that makes it do anything.
 */
export const dynamic = 'force-dynamic';

export default async function MfaChallengePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <MfaChallengeClient next={safeNextPath(next)} />;
}
