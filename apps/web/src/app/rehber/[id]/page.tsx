import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { GUIDE_SECTIONS, SECTION_LABELS } from '@/lib/guide/topic';
import { GUIDE_TOPICS } from '@/lib/guide/topics';
import { visibleTopics } from '@/lib/guide/visible';
import { requirePermission } from '@/lib/server/auth/page-guard';
import { getCachedModules } from '@/lib/server/modules';
import { GuideMarkdown } from '../guide-markdown';

export const dynamic = 'force-dynamic';

/** doc 19 §5: one topic. A topic of a switched-off module is not found, like any other absent page. */
export default async function GuideTopicPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  const { id } = await params;
  const visible = visibleTopics(GUIDE_TOPICS, await getCachedModules());
  const topic = visible.find((t) => t.id === id);
  if (topic === undefined) notFound();
  const visibleIds = new Set(visible.map((t) => t.id));
  const hiddenIds = new Set(GUIDE_TOPICS.filter((t) => !visibleIds.has(t.id)).map((t) => t.id));

  return (
    <div className="space-y-4">
      <PageHeader
        title={topic.title}
        breadcrumb={[
          { label: 'Rehber', href: '/rehber' },
          { label: SECTION_LABELS[topic.section] },
          { label: topic.title },
        ]}
      />
      <div className="flex gap-8">
        <nav aria-label="Rehber konuları" className="hidden w-56 flex-none text-sm lg:block">
          {GUIDE_SECTIONS.map((section) => {
            const inSection = visible.filter((t) => t.section === section);
            if (inSection.length === 0) return null;
            return (
              <div key={section} className="mb-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-(--color-muted)">
                  {SECTION_LABELS[section]}
                </p>
                <ul className="space-y-1">
                  {inSection.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/rehber/${t.id}`}
                        aria-current={t.id === topic.id ? 'page' : undefined}
                        className={
                          t.id === topic.id ? 'font-semibold' : 'text-(--color-accent) hover:underline'
                        }
                      >
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <article className="min-w-0 flex-1">
          {topic.headings.some((h) => h.depth === 2) && (
            <nav
              aria-label="Bu sayfada"
              className="mb-4 rounded-xl border border-(--color-border) bg-(--color-surface) p-3 text-sm"
            >
              <p className="mb-1 font-semibold">Bu sayfada</p>
              <ul className="space-y-0.5">
                {topic.headings
                  .filter((h) => h.depth === 2)
                  .map((h) => (
                    <li key={h.slug}>
                      <a href={`#${h.slug}`} className="text-(--color-accent) hover:underline">
                        {h.text}
                      </a>
                    </li>
                  ))}
              </ul>
            </nav>
          )}
          <GuideMarkdown body={topic.body} hiddenIds={hiddenIds} />
        </article>
      </div>
    </div>
  );
}
