/**
 * Actor values written to every `changed_by` / `updated_by` column and to
 * `price_submissions.requested_by` (docs/18-authentication-and-access.md §9.1, doc 05 §2).
 *
 * Plain text, not a foreign key: three of the four kinds are not users.
 */

export const SYSTEM_ACTOR = 'system';
export const CLI_ACTOR = 'cli';
/** Rows written before sign-in existed. Read and displayed, never written again. */
export const LEGACY_OPERATOR_ACTOR = 'operator';

const USER_PREFIX = 'user:';

export type ParsedActor =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'system' }
  | { readonly kind: 'cli' }
  | { readonly kind: 'legacy-operator' }
  | { readonly kind: 'other'; readonly raw: string };

export function userActor(userId: string): string {
  if (userId === '') throw new Error('userActor: empty user id');
  return `${USER_PREFIX}${userId}`;
}

/**
 * `other` covers labels older code wrote before this convention (`setup-wizard`, for one) —
 * they are shown as written rather than rejected, since rewriting history is not an option.
 */
export function parseActor(raw: string): ParsedActor {
  if (raw.startsWith(USER_PREFIX) && raw.length > USER_PREFIX.length) {
    return { kind: 'user', userId: raw.slice(USER_PREFIX.length) };
  }
  // `system:<detail>` (the licence check writes `system:license`) is still the system.
  if (raw === SYSTEM_ACTOR || raw.startsWith(`${SYSTEM_ACTOR}:`)) return { kind: 'system' };
  if (raw === CLI_ACTOR) return { kind: 'cli' };
  if (raw === LEGACY_OPERATOR_ACTOR) return { kind: 'legacy-operator' };
  return { kind: 'other', raw };
}
