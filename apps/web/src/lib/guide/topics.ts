import { RAW_TOPICS } from './generated';
import { GUIDE_SECTIONS, parseTopics, type GuideTopic } from './topic';

/** Every topic, in display order: by section (doc 19 §2.1), then `order`, then title. */
export const GUIDE_TOPICS: readonly GuideTopic[] = [...parseTopics(RAW_TOPICS)].sort(
  (a, b) =>
    GUIDE_SECTIONS.indexOf(a.section) - GUIDE_SECTIONS.indexOf(b.section) ||
    a.order - b.order ||
    a.title.localeCompare(b.title, 'tr'),
);

export function topicById(id: string): GuideTopic | undefined {
  return GUIDE_TOPICS.find((t) => t.id === id);
}
