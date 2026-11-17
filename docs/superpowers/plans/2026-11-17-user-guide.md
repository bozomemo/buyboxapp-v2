# Kullanım Rehberi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An in-app Turkish user guide at `/rehber`, linked from every screen, kept current by a rule and by tests.

**Architecture:** Markdown topics with frontmatter in `apps/web/content/rehber/`. A tiny `.mjs` generator embeds the raw files into a gitignored TS module, so the content ships inside the standalone server bundle. A TS library parses and validates topics. `/rehber` renders them with `react-markdown`, filtered by enabled module. A header "?" control maps the current path to its topic. Tests enforce that every page has exactly one topic.

**Tech Stack:** Next.js 16 (App Router, standalone), React 19, Vitest, `react-markdown@10.1.0`, `remark-gfm@4.0.1`.

**Spec:** `docs/superpowers/specs/2026-11-17-user-guide-design.md` (approved 2026-11-17). Becomes `docs/19-user-guide.md` in Task 1.

## Global Constraints

- All guide content Turkish; second person plural; UI labels named exactly as the UI shows them, in bold.
- Content describes the code in the same commit, never the spec ahead of it; never from `reference/legacy-app/`.
- No internal names in content: job names, API paths, table names, env vars, scraping methods. No break-glass procedure (doc 18 §8.3).
- Money examples in whole TL, VAT-inclusive (doc 02 §0); no VAT formula.
- Permission-gated actions are described, with the roles that may do them; topics are filtered by **module only**.
- Raw HTML in Markdown is not rendered. `<!-- kaynak: … -->` source comments are allowed and stripped.
- No screenshots in v1.
- `/rehber` pages call `requirePermission('view')` (doc 18 §7.2; `page-guard.test.ts` enforces it).
- Login/MFA note text, verbatim: "Şifrenizi veya doğrulama kodunuzu kaybettiyseniz yöneticinize başvurun; yönetici **Kullanıcılar** ekranından sıfırlayabilir."
- Next 16 differs from training data: read `apps/web/node_modules/next/dist/docs/` before writing route code (`apps/web/AGENTS.md`).

## Review Focus

1. **Turkish search folding:** searching "ilan" must find "İlanlar"; "IŞIK" must match "ışık". → test in Task 4.
2. **Module switched off:** a brand-only install must not list, search, or open (`/rehber/<brand-topic>` → not found) brand topics, and links to them render as plain text. → tests in Task 4.
3. **Dynamic routes for "?":** `/listings/123` and `/competitors/sellers/trendyol/abc` must open their topic, `/brands` must not match `/brand`. → test in Task 5.
4. **Malformed topic file:** missing `title`, unknown `section`, duplicate `id` must fail tests with the file name in the message, not crash `/rehber` silently. → tests in Task 2.
5. **Standalone build:** `/rehber` must work from the packaged standalone server, not only `next dev`. → verification in Task 9.

---

### Task 1: Specification

**Files:**
- Create: `docs/19-user-guide.md`
- Modify: `CLAUDE.md` (documentation map, Hard rules), `docs/06-user-interface.md` (§1 Navigation: **Rehber** item in Sistem; header "?" control), `docs/12-build-plan.md` (Phase 13 before "Phase 9 — MAY-ADD-LATER"), `docs/18-authentication-and-access.md` (§11 Screens: login/MFA note)

- [ ] **Step 1:** Write `docs/19-user-guide.md` from design §6, §7, §8 as normative spec. Sections: 1 Purpose and reader; 2 Content files and frontmatter; 3 Writing rules; 4 Embedding; 5 The `/rehber` screen; 6 Header control; 7 Keeping the guide current (trigger list, non-triggers, report line `Rehber: güncellendi (<ids>)` / `Rehber: etkilenmedi — <neden>`); 8 Tests 1–4; 9 Login/MFA note; 10 Out of scope (screenshots, editing in UI, English, public guide).
- [ ] **Step 2:** `CLAUDE.md`: add map row `| **User guide (Rehber), any user-visible change** | **docs/19-user-guide.md** |`. Add Hard rule: "**A user-visible change updates the guide in the same commit.** Screens, columns, buttons, labels, flows, permissions, messages and settings are described in `apps/web/content/rehber/`; change them together and end your report with the `Rehber:` line (doc 19 §7)."
- [ ] **Step 3:** doc 06 §1, doc 12 Phase 13 (definition of done from design §6.7), doc 18 §11.
- [ ] **Step 4: Commit** `docs: specify the in-app user guide (doc 19)`

### Task 2: Topic model and parser

**Files:**
- Create: `apps/web/src/lib/guide/topic.ts`, `apps/web/src/lib/guide/topic.test.ts`

**Interfaces — Produces:**
```ts
export type GuideSection = 'start' | 'concepts' | 'screens' | 'faq' | 'troubleshooting' | 'glossary';
export const GUIDE_SECTIONS: readonly GuideSection[]; // in that display order
export const SECTION_LABELS: Record<GuideSection, string>; // Başlangıç, Temel Kavramlar, Ekranlar, Sık Sorulanlar, Sorun Giderme, Sözlük
export type GuideTopic = { id: string; title: string; section: GuideSection; order: number;
  module: AppModule | null; routes: readonly string[]; body: string /* source comments stripped */;
  headings: readonly { depth: 2 | 3; text: string; slug: string }[] };
export function parseTopic(file: string, source: string): GuideTopic; // throws Error(`${file}: <reason>`)
export function parseTopics(raw: readonly { file: string; source: string }[]): readonly GuideTopic[]; // also checks duplicate ids
export function headingSlug(text: string): string; // Turkish-aware: lowercase tr-TR, ç→c ğ→g ı→i ö→o ş→s ü→u, non [a-z0-9] → '-', trimmed
```
Frontmatter is a small fixed YAML subset (scalars and one `routes:` list); parse it by hand, no YAML dependency. `module: null` → `null`.

- [ ] **Step 1: Write failing tests** in `topic.test.ts`:
  - valid file → fields as given; `routes: []` allowed;
  - `<!-- kaynak: doc 03 §2 -->` absent from `body`;
  - headings `## Fiyat neden değişmedi?` → `{depth:2, slug:'fiyat-neden-degismedi'}`;
  - throws with message containing the file name for: missing `title`; `section: foo`; `module: x`; `id: Bad_Id` (must match `/^[a-z0-9]+(-[a-z0-9]+)*$/`); route not starting with `/`; missing frontmatter;
  - `parseTopics` throws on a duplicate `id`, naming both files.
- [ ] **Step 2:** Run `npm test --workspace=apps/web -- src/lib/guide/topic.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `topic.ts`.
- [ ] **Step 4:** Run again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): parse and validate guide topics`

### Task 3: Embedding, coverage tests, placeholder topics

**Files:**
- Create: `apps/web/scripts/generate-guide.mjs`, `apps/web/src/lib/guide/topics.ts`, `apps/web/src/lib/guide/coverage.test.ts`, `apps/web/content/rehber/*.md`
- Modify: `apps/web/package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: `parseTopics`, `headingSlug` (Task 2); `moduleForPath` from `@/lib/module-routes`.
- Produces: `apps/web/src/lib/guide/generated.ts` (gitignored) exporting `RAW_TOPICS: readonly { file: string; source: string }[]`; `topics.ts` exporting `GUIDE_TOPICS: readonly GuideTopic[]` (= `parseTopics(RAW_TOPICS)`) and `topicById(id: string): GuideTopic | undefined`.

- [ ] **Step 1:** `generate-guide.mjs`: read `content/rehber/*.md` (sorted), write `src/lib/guide/generated.ts` with `JSON.stringify`'d sources and a "generated — do not edit" header. Add to `package.json`: `"guide:gen": "node scripts/generate-guide.mjs"`, and `predev`, `prebuild`, `pretest`, `pretypecheck` each `npm run guide:gen`. Add `apps/web/src/lib/guide/generated.ts` to `.gitignore`.
- [ ] **Step 2: Write failing tests** in `coverage.test.ts` (node environment, reads the files from disk with `fs` via `parseTopics`, so it never depends on a stale generated module):
  - `every page is claimed by exactly one topic`: each non-`api/` `page.tsx` route (app-dir path → `/x/[id]`, root `page.tsx` → `/`) appears in exactly one topic's `routes`; failure lists unclaimed and double-claimed routes;
  - `no topic claims a page that does not exist`;
  - `a topic's module matches every route it claims`: `topic.module === moduleForPath(route with [seg] replaced by 'x')`;
  - `internal links resolve`: every Markdown link to `/rehber/<id>` or `/rehber/<id>#<slug>` names an existing topic and heading slug;
  - `the generated module matches the content folder`: `RAW_TOPICS` file list equals the folder listing (catches a forgotten `guide:gen`).
- [ ] **Step 3:** Run `npm test --workspace=apps/web -- src/lib/guide/coverage.test.ts`. Expected: FAIL — 43 unclaimed routes.
- [ ] **Step 4:** Create placeholder topics so the suite is green. One topic per screen or screen group; suggested ids: `panel`, `stock`, `listings`, `brands`, `competitors`, `competitor-sellers` (claims `/competitors/sellers`), `seller-detail` (`/competitors/sellers/[marketplace]/[ref]`, `module: null`), `alerts`, `brand-products`, `brand-listings`, `brand-alerts`, `brand-profit`, `watched-brands`, `tracked-products`, `brand-sellers`, `seller-policy`, `findings`, `cross-marketplace`, `brand-comparison`, `jobs`, `events`, `settings`, `settings-fees`, `settings-policy`, `settings-product-sources`, `settings-marketplaces`, `settings-modules`, `settings-retention`, `settings-database`, `settings-update`, `users` (`/settings/users`, `/settings/users/activity`), `account` (`/account`, `/account/password`, `/account/mfa-setup`), `sign-in` (`/login`, `/login/mfa`, `/bootstrap`), `setup` (`/setup`), `license`, `guide` (`/rehber`, `/rehber/[id]` — add after Task 4 creates them). Plus non-screen topics with `routes: []`: `start`, `concepts-floor-price`, `concepts-buybox`, `concepts-cost-and-fees`, `concepts-repricing`, `concepts-automation-and-stop`, `concepts-roles`, `concepts-competitor-data`, `faq`, `troubleshooting`, `glossary`. Each placeholder body: one line `Bu bölüm hazırlanıyor.` and a `<!-- kaynak: … -->` comment naming the spec sections to write from. Set `module` per `moduleForPath`.
- [ ] **Step 5:** Run the full web suite `npm test --workspace=apps/web`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): embed guide content and enforce page coverage`

### Task 4: `/rehber` screens, search, module filter, sidebar item

**Files:**
- Create: `apps/web/src/lib/guide/search.ts`, `apps/web/src/lib/guide/search.test.ts`, `apps/web/src/lib/guide/visible.ts`, `apps/web/src/lib/guide/visible.test.ts`, `apps/web/src/app/rehber/page.tsx`, `apps/web/src/app/rehber/[id]/page.tsx`, `apps/web/src/app/rehber/guide-client.tsx`, `apps/web/src/app/rehber/guide-markdown.tsx`, `apps/web/src/app/rehber/guide-markdown.test.tsx`
- Modify: `apps/web/package.json` (deps), `apps/web/src/lib/module-routes.ts` (no change expected: `/rehber` falls through to `null` — assert in test), `apps/web/src/app/nav-shell.tsx` (Sistem group: `{ href: '/rehber', label: 'Rehber', icon: BookOpen }`), `apps/web/src/app/nav-shell.test.tsx` if it pins the item list

**Interfaces:**
- Consumes: `GUIDE_TOPICS`, `topicById` (Task 3); `getCachedModules()` from `@/lib/server/modules`; `PageHeader`, `EmptyState` from `@/components/ui`.
- Produces: `visibleTopics(topics, modules: EnabledModules): readonly GuideTopic[]`; `searchTopics(topics, query: string): readonly GuideTopic[]` (title hits first, then heading hits, then body hits; empty query → all); `foldTr(s: string): string`.

- [ ] **Step 1:** `npm install --workspace=apps/web --save-exact react-markdown@10.1.0 remark-gfm@4.0.1`.
- [ ] **Step 2: Write failing tests:**
  - `visible.test.ts`: with `{seller:false, brand:true}`, seller topics are dropped, `module: null` topics kept.
  - `search.test.ts`: `foldTr('İlanlar') === foldTr('ilanlar')`; `foldTr('IŞIK') === 'ışık'`; query `ilan` finds title `İlanlar`; title hit ranks above body hit; whitespace-only query returns all.
  - `guide-markdown.test.tsx`: GFM table renders a `<table>`; `<script>` in source is not rendered as an element; `## Başlık` gets `id="baslik"`; a link to a hidden topic id (passed as `hiddenIds`) renders as plain text, not `<a>`.
  - `module-routes` assertion: `moduleForPath('/rehber') === null`.
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Implement `visible.ts`, `search.ts` (`foldTr` = `toLocaleLowerCase('tr-TR')`), and `GuideMarkdown({ body, hiddenIds }: { body: string; hiddenIds: ReadonlySet<string> })` using `react-markdown` + `remark-gfm`, `skipHtml`, heading ids from `headingSlug`.
- [ ] **Step 5:** Pages. `rehber/page.tsx`: `requirePermission('view')`, `PageHeader` title `Kullanım Rehberi`, passes `visibleTopics(GUIDE_TOPICS, await getCachedModules())` (id, title, section, headings, body) to `GuideClient`, which renders the search box and the topic list grouped by `SECTION_LABELS`; screen topics in sidebar order. `rehber/[id]/page.tsx`: guard; topic not found **or not visible** → `notFound()`; left list of visible topics, the topic body via `GuideMarkdown`, an in-page heading list. Add `/rehber` and `/rehber/[id]` to the `guide` topic's `routes`.
- [ ] **Step 6:** Run `npm test --workspace=apps/web` and `npm run typecheck --workspace=apps/web`. Expected: PASS (page-guard and coverage tests included).
- [ ] **Step 7: Commit** `feat(web): Rehber screen with search and module filter`

### Task 5: Header "?" control

**Files:**
- Create: `apps/web/src/lib/guide/route-match.ts`, `apps/web/src/lib/guide/route-match.test.ts`
- Modify: `apps/web/src/app/nav-shell.tsx` (header, before `ThemeToggle`)

**Interfaces — Produces:** `topicIdForPath(pathname: string, topics: readonly Pick<GuideTopic, 'id' | 'routes'>[]): string | null` — segment-wise match, `[x]` matches one non-empty segment, exact segment count; most specific (fewest dynamic segments) wins.

- [ ] **Step 1: Failing tests:** `/listings/123` → `listings`; `/competitors/sellers/trendyol/abc` → `seller-detail`; `/competitors/sellers` → `competitor-sellers`; `/brands` → `brands` (not `brand-*`); `/` → `panel`; `/nope` → `null`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. In `nav-shell.tsx` add a `Link` with `CircleHelp` icon, `title="Bu ekranın rehberi"`, `aria-label` the same, href `/rehber/${id}` or `/rehber` when `null`. Import only `{id, routes}` pairs into the client bundle (export `GUIDE_ROUTE_INDEX` from `topics.ts`), not bodies.
- [ ] **Step 4:** Run `npm test --workspace=apps/web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): header link to the current screen's guide`

### Task 6: Login and MFA note

**Files:** Modify `apps/web/src/app/login/login-client.tsx`, `apps/web/src/app/login/mfa/mfa-challenge-client.tsx`; Test: their existing or new `*.test.tsx`.

- [ ] **Step 1: Failing test:** each screen renders the exact note text (Global Constraints), under the form, muted small text, with **Kullanıcılar** bold.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (one shared `LostAccessNote` in `components/auth-card.tsx`). **Step 4:** Run → PASS.
- [ ] **Step 5:** Fill the `sign-in` topic's admin-facing text: resetting a user's password and second factor from **Kullanıcılar**, clearing a lockout (doc 18 §3.3, §5, §6). Verify labels against `settings/users`.
- [ ] **Step 6: Commit** `feat(web): tell a locked-out user to ask an administrator`

### Task 7: Başlangıç, concepts, FAQ, troubleshooting, glossary

**Files:** `apps/web/content/rehber/start.md`, `concepts-*.md`, `faq.md`, `troubleshooting.md`, `glossary.md`

Write from the spec and verify against the running app (`npm run dev --workspace=apps/web`, sign in with the dev seed admin). Sources:
- `start`: doc 18 §8.1 (first admin), doc 06 setup wizard section, doc 13 (licence), doc 17 §1 (modules), doc 08 (fees/policy settings as the UI exposes them), stock import (doc 06 §3), safe automation start (doc 03, doc 06 §2 kill switches). End with a checklist.
- concepts: doc 02 (floor, cost, fees — no VAT), doc 03 (decision, plain language), doc 06 §2 + doc 18 §6.1 (stop vs release), doc 18 §6.2 (roles table in Turkish), competitor data is reporting only and never moves a price.
- `troubleshooting`: entries per design §6.1, each symptom → causes in order → which screen to check → when to contact the installer.
- `faq`: at least 20 questions, each linking to its topic.
- [ ] **Step 1:** Write the topics. **Step 2:** `npm test --workspace=apps/web` → PASS (links resolve). **Step 3:** Report which screens were opened to check labels.
- [ ] **Step 4: Commit** `docs(rehber): getting started, concepts, FAQ, troubleshooting`
- [ ] **Step 5:** Product owner reads `start` and `troubleshooting`; apply corrections; commit.

### Task 8: Screen topics

**Files:** every remaining placeholder in `apps/web/content/rehber/`. Three commits: seller screens; brand-module screens; system, settings, account, licence, setup, guide.

Each screen topic: what the screen is for; each section, column, filter, button (exact label, bold) and what it does; which roles may act; "Sık sorulanlar" (2–5); links to concepts. Source: the screen's doc 06 / doc 17 / doc 18 section **and** the screen's code (`labels.ts`, the client component) — where they disagree, the code wins and the disagreement is reported to the product owner.
- [ ] **Step 1:** Seller screens → open each in the running app, write, test, commit `docs(rehber): seller screens`.
- [ ] **Step 2:** Brand screens → same, commit `docs(rehber): brand module screens`.
- [ ] **Step 3:** System/settings/account → same, commit `docs(rehber): system and settings screens`.
- [ ] **Step 4:** `grep -rl "Bu bölüm hazırlanıyor" apps/web/content/rehber` → no output.

### Task 9: Standalone verification

- [ ] **Step 1:** `npm run build` from the repo root. Expected: success.
- [ ] **Step 2:** Start the standalone server per doc 14 §8 packaging (copy `.next/static` and `public` as the packaging step does), open `/rehber`, a screen topic, search for `ilan`, and the "?" link from `/listings`. Expected: all render content, not placeholders or errors.
- [ ] **Step 3:** Report the result; the final report ends with `Rehber: güncellendi (all topics)`.
