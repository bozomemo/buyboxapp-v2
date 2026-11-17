import Link from 'next/link';
import { Children, isValidElement, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { headingSlug } from '@/lib/guide/topic';

/** Plain text of a heading's children, for its anchor (the same slug the link test checks). */
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return textOf(child.props.children);
      return '';
    })
    .join('');
}

/**
 * One topic's Markdown (doc 19 §3, §5). Raw HTML is skipped, never rendered. A link to a topic
 * this install hides (its module is off) is shown as its text only, so the guide never leads to
 * a page that answers "not found".
 */
export function GuideMarkdown({ body, hiddenIds }: { body: string; hiddenIds: ReadonlySet<string> }) {
  const components: Components = {
    h2: ({ children }) => (
      <h2 id={headingSlug(textOf(children))} className="mt-8 mb-3 scroll-mt-4 text-lg font-bold">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 id={headingSlug(textOf(children))} className="mt-6 mb-2 scroll-mt-4 text-base font-semibold">
        {children}
      </h3>
    ),
    a: ({ href = '', children }) => {
      const internal = /^\/rehber\/([^#?]+)/.exec(href);
      if (internal && hiddenIds.has(internal[1]!)) return <span>{children}</span>;
      if (href.startsWith('/')) {
        return (
          <Link href={href} className="font-medium text-(--color-accent) hover:underline">
            {children}
          </Link>
        );
      }
      return (
        <a href={href} className="font-medium text-(--color-accent) hover:underline" target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    p: ({ children }) => <p className="my-3 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border-b border-(--color-border) px-3 py-2 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-(--color-border) px-3 py-2 align-top">{children}</td>,
    blockquote: ({ children }) => (
      <blockquote className="my-4 rounded border-l-4 border-(--color-accent) bg-(--color-surface) px-4 py-2">{children}</blockquote>
    ),
    code: ({ children }) => <code className="rounded bg-(--color-surface) px-1 py-0.5 text-[0.9em]">{children}</code>,
  };
  return (
    <div className="max-w-3xl text-sm">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {body}
      </Markdown>
    </div>
  );
}
