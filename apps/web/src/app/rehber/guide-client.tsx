'use client';

import { Search } from '@/components/icon';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, TextInput } from '@/components/ui';
import { searchTopics } from '@/lib/guide/search';
import { GUIDE_SECTIONS, SECTION_LABELS, type GuideHeading, type GuideSection } from '@/lib/guide/topic';

export type GuideListItem = {
  readonly id: string;
  readonly title: string;
  readonly section: GuideSection;
  readonly headings: readonly GuideHeading[];
  readonly body: string;
};

/** The guide's index: a search box over the visible topics, then the topics by section (doc 19 §5). */
export function GuideClient({ topics }: { topics: readonly GuideListItem[] }) {
  const [query, setQuery] = useState('');
  const shown = searchTopics(topics, query);
  const searching = query.trim() !== '';

  return (
    <div className="space-y-6">
      <div className="max-w-md">
        <TextInput
          icon={Search}
          type="search"
          aria-label="Rehberde ara"
          placeholder="Rehberde ara… (ör. şifre, rakip, alarm)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {shown.length === 0 && (
        <EmptyState
          message="Sonuç bulunamadı."
          reason="Başka bir kelime deneyin ya da aşağıdaki Sık Sorulanlar ve Sorun Giderme bölümlerine bakın."
        />
      )}

      {searching ? (
        <ul className="space-y-2">
          {shown.map((t) => (
            <li key={t.id}>
              <Link href={`/rehber/${t.id}`} className="font-medium text-(--color-accent) hover:underline">
                {t.title}
              </Link>
              <span className="ml-2 text-xs text-(--color-muted)">{SECTION_LABELS[t.section]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {GUIDE_SECTIONS.map((section) => {
            const inSection = shown.filter((t) => t.section === section);
            if (inSection.length === 0) return null;
            return (
              <section
                key={section}
                className="rounded-xl border border-(--color-border) bg-(--color-surface) p-4"
              >
                <h2 className="mb-3 text-sm font-bold">{SECTION_LABELS[section]}</h2>
                <ul className="space-y-1.5 text-sm">
                  {inSection.map((t) => (
                    <li key={t.id}>
                      <Link href={`/rehber/${t.id}`} className="text-(--color-accent) hover:underline">
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
