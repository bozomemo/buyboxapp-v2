# In-app user guide (Kullanım Rehberi) — design

Date: 2026-11-17. Status: approved by the product owner 2026-11-17 (builder check done).

Becomes spec: `docs/19-user-guide.md` (new). Touches: `CLAUDE.md`, doc 06 (header control),
doc 12 (new phase), `apps/web` (new `/rehber` route, header "?" control, guide content).

## 1. Why

The product is installed at customer firms. Product owner, 2026-11-17:

- "Bütün uygulama için kullanıcının göreceği yerde kullanım rehberi olsun istiyorum. Burada
  uygulama için gerekli bütün bilgiler, sorulabilecek sorular olsun."
- "Yapılan geliştirmelerde akış, sayfa veya rehberde değişiklik olmasını gerektirecek bir yer
  olduğu zaman otomatik rehberi de güncellesin. Bunu spec'e ekleyelim. Özellikle agentlar dikkat
  etsin."
- Reader: "Ben bunu bir firmaya kurduğumda destek için buraya bakacak."

So the guide is the customer's **first line of support**: a user at an installed firm must be
able to go from a fresh install to daily use, and answer "why did X happen?" without calling the
product owner. And it must never drift from the app, because a wrong guide is worse than none —
it sends the customer confidently down the wrong path.

## 2. Goals

1. A **Rehber** screen inside the app (`/rehber`), in Turkish, reachable from every screen.
2. **Covers the whole app:** getting started, concepts, every screen, FAQ, troubleshooting,
   glossary.
3. **Context link:** a "?" control in the header opens the guide section for the current screen.
4. **Module-aware:** sections for a module that is switched off at this install are not shown.
5. **Stays current by rule and by test:** every change that alters what a user sees or does
   updates the guide in the same commit; a test fails when a page has no guide section or a guide
   section names a page that no longer exists.

## 3. Non-goals

- No editing of guide content from the UI, and no guide content in the database.
- No English version.
- No screenshots in the first version (§6.6).
- No contact form, ticketing or chat. The guide may name "contact your installer" as the last
  step of a troubleshooting entry; it does not carry contact details (they differ per install).

## 4. Anti-goals — failure even if it works

- **The guide states something the app does not do.** Content is written from the specification
  (`docs/`) and the current code — never from `reference/legacy-app/`, never from memory.
- **Internal leakage:** job class names, API paths, table names, environment variable names, or
  anything about scraping methods (browser impersonation etc.) appear in customer-facing text.
  Exception: a setting the customer must type in the UI, named exactly as the UI shows it.
- **A security hint:** the guide explains how to reset a password through an administrator; it
  never documents break-glass recovery (doc 18 §8.3) — that is the installer's procedure, not the
  customer's.
- **Money shown as a formula with floats or VAT.** Examples use whole TL amounts, VAT-inclusive,
  consistent with doc 02 §0.

## 5. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Plain Markdown files with frontmatter, embedded at build time, rendered by `/rehber` | Easy for people and agents to edit; simple to enforce by test; no live components inside text |
| B | MDX | Rich components, but extra Next 16 config and one bad edit breaks the build; prose becomes code |
| C | Content as TypeScript objects | Fully typed, but long prose and FAQs are painful to write and review |

Product owner chose **A** on 2026-11-17. Content in the database was rejected earlier the same
day: agents cannot update it alongside code, which defeats goal 5.

## 6. Design

### 6.1 Content files

`apps/web/content/rehber/` holds one Markdown file per **topic**. Each file starts with
frontmatter:

```yaml
---
id: listings                 # stable, kebab-case; used in URLs (/rehber/listings)
title: İlanlar
section: screens             # start | concepts | screens | faq | troubleshooting | glossary
order: 20                    # sort within section
module: seller               # seller | brand | null (shown to everyone)
routes:                      # app pages this topic documents; [] for non-screen topics
  - /listings
  - /listings/[id]
---
```

Route patterns use the app directory's own spelling (`[id]`, `[marketplace]/[ref]`).

Suggested topic list (builder may split or merge screens; the coverage test is what binds):

- **start** — Kurulumdan sonra ilk adımlar: first administrator and sign-in, the setup wizard,
  licence, connecting marketplaces, fees and policy, modules, importing stock, turning automation
  on safely; a short checklist at the end.
- **concepts** — Taban fiyat, buybox, maliyet / komisyon / kargo, how a repricing decision is made
  (plain language, from doc 03), automation flags, kill switches and system pause, roles and what
  each may do, competitor data is reporting only.
- **screens** — one topic per screen or screen group, covering all 43 pages (§6.4).
- **faq** — central SSS. Screen topics also end with their own "Sık sorulanlar" block.
- **troubleshooting** — price not sent, price stuck at floor, competitor data empty, job failing,
  licence warning, update failed, cannot sign in / lost second factor, marketplace credentials
  rejected. Each entry: symptom → likely causes in order → what to check on which screen → when
  to contact the installer.
- **glossary** — Sözlük.

Writing rules for content (also in doc 19):

- Turkish, second person plural ("… tıklayın"), short sentences.
- Name UI elements **exactly** as the UI labels them, in bold: **Fiyatı Güncelle**.
- Where an action needs a permission, say which role has it ("Bu işlem Yönetici ve Fiyat
  Yöneticisi rollerine açıktır") instead of hiding the text — a viewer must learn why the button
  is missing.
- The source of truth for behaviour is `docs/`; each topic file ends with an HTML comment listing
  the spec sections it was written from (`<!-- kaynak: doc 03 §2, doc 06 §5 -->`), not rendered,
  so the next editor knows what to re-read.

### 6.2 Embedding (build time, not runtime)

The installer ships Next's standalone output, which does not carry arbitrary files read at
runtime (doc 14 §4.2, §8). Guide content must therefore be **inside the server bundle**: a
generator script reads `content/rehber/*.md`, validates frontmatter, and writes a TypeScript
module the `/rehber` route imports. It runs before `next build` and before the web tests.

- The generated module is **not committed**; `.gitignore` lists it.
- Frontmatter validation fails the build on: unknown `section` or `module`, duplicate `id`,
  missing `title`, a malformed route.

Builder may choose a bundler-native raw import instead if it is shown to survive the installer
build (doc 14 §8 packaging) — the constraint is "works in the installed app", proven by running
the packaged build, not by `next dev`.

### 6.3 The `/rehber` screen

- `/rehber` — index: a search box, then sections in order (start, concepts, screens grouped as
  in the sidebar, faq, troubleshooting, glossary).
- `/rehber/[id]` — one topic, with a left list of topics (same filtering) and in-page headings.
- Guarded like every page: `requireSession` (doc 18 §7.2; `page-guard.test.ts` covers it). Any
  signed-in role may read it.
- **Module filter:** topics whose `module` is switched off at this install are not listed, not
  searched, and their URL returns the normal not-found page.
- **Search:** client-side over title, headings and body; Turkish-aware case folding
  (`toLocaleLowerCase('tr-TR')`, so İ/i and I/ı match as a Turkish reader expects).
- Rendering: Markdown → HTML with GFM tables, using the app's typography tokens (doc 15).
  Raw HTML in content is not rendered (only the source comments of §6.1, which are stripped).
- Sidebar: a **Rehber** item in the **Sistem** group (`nav-shell.tsx`), icon `BookOpen`.

### 6.4 Header "?" control

One control in the header, not per page: it maps the current pathname to the topic whose
`routes` contains it (dynamic segments matched as patterns) and links to `/rehber/<id>`. If no
topic matches — which the coverage test prevents — it links to `/rehber`.

### 6.5 Enforcement — the rule and the tests

**Rule** (in `CLAUDE.md` Hard rules and doc 19): any change that alters what a user sees or does
updates the guide **in the same commit**. Triggers:

- a page added, removed, renamed or moved;
- a column, filter, button, field, menu item, default value, or a label's wording changed;
- a flow's steps or order changed (setup wizard, import, sweep, approval…);
- a permission or role mapping changed;
- a user-visible error or warning message changed or added;
- a setting added, removed, or its meaning changed;
- a behaviour the guide explains changed (e.g. when automation will not move a price).

Not triggers: refactors, performance work, test-only changes, internal job changes with no
visible effect.

An agent's final report for any change under `apps/web` or touching user-visible behaviour states
one line: `Rehber: güncellendi (<topic ids>)` or `Rehber: etkilenmedi — <reason>`.

**Tests** (`apps/web`, run with the normal suite):

1. **Coverage:** every `page.tsx` under `apps/web/src/app` (excluding `api/`) is claimed by
   exactly one topic's `routes`. Includes the public pages (login, MFA, bootstrap) — their
   topics are read by an administrator after sign-in.
2. **No dead routes:** every route in any topic's `routes` exists as a `page.tsx`.
3. **Module consistency:** a topic's `module` equals `moduleForPath(route)`
   (`apps/web/src/lib/module-routes.ts`, the one table the proxy and the sidebar already share)
   for every route it claims. (Changed from "the sidebar group" while planning, 2026-11-17:
   `moduleForPath` also covers pages outside the sidebar, e.g. `/settings/fees` is `seller`.)
4. **Links:** every internal link in content (`/rehber/<id>`, `#heading`) resolves.

These are what make goal 5 hold when the rule is forgotten. They cannot catch a changed label or
flow inside an existing page — that part rests on the rule and on review.

### 6.6 Screenshots — deferred

Not in the first version. Images cannot be checked by the tests above and silently go stale after
the UI changes, which is the anti-goal in §4. Text names labels exactly instead. Revisit if the
product owner wants them after using the text guide; if added, they live under `public/rehber/`
(copied by the packaging step, doc 14 §8) and each has an owner topic so a screen change also
lists its images.

### 6.7 Spec changes

- **New `docs/19-user-guide.md`:** §6 of this design as normative spec, including the writing
  rules, the trigger list and the tests.
- **`CLAUDE.md`:** documentation-map row ("User guide content, `/rehber`" → doc 19) and a Hard
  rule: "A user-visible change updates `apps/web/content/rehber/` in the same commit (doc 19 §…)."
- **doc 06:** header gains the "?" control; sidebar gains **Rehber**.
- **doc 12:** a new phase, *Phase 13 — User guide*, with its definition of done: infrastructure,
  tests 1–4 green, the login-screen note in place, every topic in §6.1 written and verified
  against the running app (§7), product owner has read the start and troubleshooting sections.
  Infrastructure may land first with a short placeholder topic per page so the coverage test is
  green; the phase is not done until the placeholders are replaced.
- **doc 18 §11 (Screens):** the login and MFA screens gain the static note of §7.

## 7. Decided by the product owner (2026-11-17)

- Guide lives in the repo as Markdown, shipped with the app (approach A).
- Rule in CLAUDE.md and doc 19, plus a test that fails on an uncovered page.
- "?" link from each screen to its section.
- Reader is the customer firm's staff; the guide is their support resource, so a getting-started
  path, a broad FAQ and troubleshooting are required.
- **The guide stays behind sign-in.** The login screen (and the MFA step) instead carries one
  short static note: "Şifrenizi veya doğrulama kodunuzu kaybettiyseniz yöneticinize başvurun;
  yönetici **Kullanıcılar** ekranından sıfırlayabilir." No public guide route; doc 18 §7.3 is
  unchanged. The login/MFA topics in the guide are written for the administrator who does the
  reset. The note's wording is the UI label of record; if the users screen's name changes, the
  note changes with it (§6.5 rule).
- **Agents write all content.** Each screen topic is verified against the running app: every
  label, column, button and message the topic names is checked against what the screen actually
  shows (or the labels source it renders from), and the agent's report lists the screens it
  checked. The product owner reads **Başlangıç** (start) and **Sorun giderme**
  (troubleshooting); the remaining topics are accepted on the agent's verification.

## 8. Calls made by the designer (correct any)

- Filter by **module** only, not by permission; permissions are stated in text (§6.1).
- No screenshots in v1 (§6.6).
- One header control instead of a "?" on every page.
- Generated content module not committed.

- **The guide describes the code in the same commit, not the spec ahead of it.** A feature that
  is specified but not shipped gets no guide text (no "yakında" notes); the commit that ships it
  adds its guide text, under the §6.5 rule. Where spec and code disagree, that is a defect to fix
  per CLAUDE.md — the guide follows whichever the fix lands on, in the same commit.
- **A page shared by both modules** (e.g. `/settings/fees`, `/settings/policy`) is owned by one
  topic with `module: null`. Text that only applies to one module goes in a separate
  module-tagged topic the shared topic links to; links to a topic hidden by the module filter are
  not rendered. No per-paragraph module markers.

## 9. Left to the builder

- Exact Markdown renderer library (pinned version; must not render raw HTML).
- Generator vs. raw import (§6.2), within the stated constraint.
- Final split of screen topics, as long as coverage holds.
- Visual layout of `/rehber`, following doc 15's tokens and components.
