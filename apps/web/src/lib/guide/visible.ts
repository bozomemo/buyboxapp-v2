import type { EnabledModules } from '@buybox/shared';
import type { GuideTopic } from './topic';

/** doc 19 §5: a switched-off module's topics are not listed, searched or opened. Never by permission. */
export function visibleTopics<T extends Pick<GuideTopic, 'module'>>(
  topics: readonly T[],
  modules: EnabledModules,
): readonly T[] {
  return topics.filter((t) => t.module === null || modules[t.module]);
}
