/**
 * Actor values → words for the screen (doc 18 §9.1, doc 06 §10.5). `user:<id>` becomes the
 * user's display name; the fixed actors become their Turkish names; rows written before sign-in
 * say so rather than pretending to know who it was.
 */
import { authRepo, type AppDatabase } from '@buybox/db';
import { parseActor } from '@buybox/shared';
import { BOOTSTRAP_ACTOR } from './guard';

export const LEGACY_ACTOR_LABEL = 'Operatör (eski kayıt)';

/** Resolves every distinct actor once; `null`/`undefined` entries (the engine's own rows) are skipped. */
export async function resolveActorLabels(
  appDb: AppDatabase,
  actors: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const users = new Map<string, string>();
  for (const actor of new Set(actors)) {
    if (actor === null || actor === undefined) continue;
    const parsed = parseActor(actor);
    switch (parsed.kind) {
      case 'user': {
        if (!users.has(parsed.userId)) {
          const user = await authRepo.getUserById(appDb, parsed.userId);
          users.set(
            parsed.userId,
            user === undefined
              ? 'Bilinmeyen kullanıcı'
              : user.state === 'active'
                ? user.displayName
                : `${user.displayName} (devre dışı)`,
          );
        }
        labels.set(actor, users.get(parsed.userId)!);
        break;
      }
      case 'system':
        labels.set(actor, 'Sistem');
        break;
      case 'cli':
        labels.set(actor, 'Komut satırı');
        break;
      case 'legacy-operator':
        labels.set(actor, LEGACY_ACTOR_LABEL);
        break;
      case 'other':
        labels.set(actor, parsed.raw === BOOTSTRAP_ACTOR ? 'Kurulum' : parsed.raw === 'setup-wizard' ? 'Kurulum sihirbazı' : parsed.raw);
        break;
    }
  }
  return labels;
}
