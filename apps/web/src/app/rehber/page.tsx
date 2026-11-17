import { PageHeader } from '@/components/ui';
import { GUIDE_TOPICS } from '@/lib/guide/topics';
import { visibleTopics } from '@/lib/guide/visible';
import { requirePermission } from '@/lib/server/auth/page-guard';
import { getCachedModules } from '@/lib/server/modules';
import { GuideClient } from './guide-client';

export const dynamic = 'force-dynamic';

/** doc 19 §5: the guide's index, filtered by the modules this install has on. */
export default async function GuidePage() {
  const gate = await requirePermission('view');
  if (!gate.ok) return gate.element;
  const topics = visibleTopics(GUIDE_TOPICS, await getCachedModules()).map(
    ({ id, title, section, headings, body }) => ({
      id,
      title,
      section,
      headings,
      body,
    }),
  );
  return (
    <div className="space-y-4">
      <PageHeader
        title="Kullanım Rehberi"
        description="Uygulamanın nasıl kullanılacağı, sık sorulan sorular ve sorun giderme. Her ekranın sağ üstündeki ? işareti o ekranın bölümünü açar."
        breadcrumb={[{ label: 'Sistem' }, { label: 'Rehber' }]}
      />
      <GuideClient topics={topics} />
    </div>
  );
}
