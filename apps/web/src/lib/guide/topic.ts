/**
 * The in-app guide's topic files (doc 19 §2): Markdown with a small, fixed frontmatter. Parsed by
 * hand — the frontmatter is a handful of scalars and one list, and a YAML dependency would accept
 * far more than doc 19 allows. Every refusal names the file, because the person reading the error
 * is an agent or an editor who has to find it.
 */
import type { AppModule } from '@buybox/shared';

/**
 * The modules a topic may name. A local copy, not `APP_MODULES`: this file reaches the browser
 * through `/rehber`'s client, and a value import of `@buybox/shared` drags its Node-only barrel
 * into the bundle (client-imports.test.ts). topic.test.ts pins the copy to `APP_MODULES`.
 */
export const GUIDE_MODULES: readonly AppModule[] = ['seller', 'brand'];

export type GuideSection = 'start' | 'concepts' | 'screens' | 'faq' | 'troubleshooting' | 'glossary';

/** Display order of the sections (doc 19 §2.1). */
export const GUIDE_SECTIONS: readonly GuideSection[] = [
  'start',
  'concepts',
  'screens',
  'faq',
  'troubleshooting',
  'glossary',
];

export const SECTION_LABELS: Readonly<Record<GuideSection, string>> = {
  start: 'Başlangıç',
  concepts: 'Temel Kavramlar',
  screens: 'Ekranlar',
  faq: 'Sık Sorulanlar',
  troubleshooting: 'Sorun Giderme',
  glossary: 'Sözlük',
};

export type GuideHeading = { readonly depth: 2 | 3; readonly text: string; readonly slug: string };

export type GuideTopic = {
  readonly id: string;
  readonly title: string;
  readonly section: GuideSection;
  readonly order: number;
  readonly module: AppModule | null;
  readonly routes: readonly string[];
  /** The Markdown after the frontmatter, with `<!-- … -->` source comments removed. */
  readonly body: string;
  readonly headings: readonly GuideHeading[];
};

export type RawTopic = { readonly file: string; readonly source: string };

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ROUTE_PATTERN = /^\/([A-Za-z0-9_\-\[\]]+(\/[A-Za-z0-9_\-\[\]]+)*)?$/;

const TR_ASCII: Readonly<Record<string, string>> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

/** A heading's anchor: Turkish-lowercased, Turkish letters to ASCII, everything else to `-`. */
export function headingSlug(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => TR_ASCII[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isSection(value: string): value is GuideSection {
  return (GUIDE_SECTIONS as readonly string[]).includes(value);
}

export function parseTopic(file: string, source: string): GuideTopic {
  const fail = (reason: string): never => {
    throw new Error(`${file}: ${reason}`);
  };
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (match === null) return fail('frontmatter missing (the file must start with ---)');
  const [, head = '', rest = ''] = match;

  const fields = new Map<string, string>();
  let routes: string[] | null = null;
  let inRoutes = false;
  for (const line of head.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item) {
      if (!inRoutes || routes === null) fail(`unexpected list item: ${line.trim()}`);
      routes!.push(item[1]!.trim());
      continue;
    }
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!kv) fail(`unreadable frontmatter line: ${line}`);
    const [, key = '', value = ''] = kv!;
    inRoutes = false;
    if (key === 'routes') {
      if (value === '[]') routes = [];
      else if (value === '') {
        routes = [];
        inRoutes = true;
      } else fail('routes must be [] or a list');
      continue;
    }
    if (fields.has(key)) fail(`duplicate field: ${key}`);
    fields.set(key, value.trim());
  }

  const known = new Set(['id', 'title', 'section', 'order', 'module']);
  for (const key of fields.keys()) if (!known.has(key)) fail(`unknown field: ${key}`);

  const id = fields.get('id') ?? fail('id missing');
  if (!ID_PATTERN.test(id)) fail(`id must be kebab-case: ${id}`);
  const title = fields.get('title') || fail('title missing');
  const section = fields.get('section') ?? fail('section missing');
  if (!isSection(section)) fail(`unknown section: ${section}`);
  const orderText = fields.get('order') ?? fail('order missing');
  if (!/^\d+$/.test(orderText)) fail(`order must be a whole number: ${orderText}`);
  const moduleText = fields.get('module') ?? fail('module missing');
  let module: AppModule | null = null;
  if (moduleText !== 'null') {
    if (!(GUIDE_MODULES as readonly string[]).includes(moduleText)) fail(`unknown module: ${moduleText}`);
    module = moduleText as AppModule;
  }
  if (routes === null) fail('routes missing (use routes: [] for a topic without a screen)');
  for (const route of routes!)
    if (!ROUTE_PATTERN.test(route)) fail(`route must be an absolute app path: ${route}`);

  const body = rest.replace(/<!--[\s\S]*?-->/g, '').trim() + '\n';
  const headings: GuideHeading[] = [];
  let fence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (fence) continue;
    const h = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) headings.push({ depth: h[1]!.length as 2 | 3, text: h[2]!, slug: headingSlug(h[2]!) });
  }

  return {
    id,
    title,
    section: section as GuideSection,
    order: Number(orderText),
    module,
    routes: routes!,
    body,
    headings,
  };
}

export function parseTopics(raw: readonly RawTopic[]): readonly GuideTopic[] {
  const byId = new Map<string, string>();
  return raw.map(({ file, source }) => {
    const topic = parseTopic(file, source);
    const other = byId.get(topic.id);
    if (other !== undefined) throw new Error(`${other} and ${file}: duplicate id ${topic.id}`);
    byId.set(topic.id, file);
    return topic;
  });
}
