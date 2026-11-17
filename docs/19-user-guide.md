# 19 — In-app user guide (Kullanım Rehberi)

Status: **specified 2026-11-17** (design `docs/superpowers/specs/2026-11-17-user-guide-design.md`,
approved by the product owner the same day). Build: doc 12 Phase 13.

## 1. Purpose and reader

The product is installed at customer firms. The guide is **their first line of support**: a user
at an installed firm must be able to go from a fresh install to daily use, and answer "why did
this happen?", without calling the installer.

Product owner, 2026-11-17: _"Ben bunu bir firmaya kurduğumda destek için buraya bakacak."_

A wrong guide is worse than none — it sends the customer confidently down the wrong path. Keeping
it current is therefore part of every user-visible change (§7), not a separate task.

## 2. Content files

Guide content lives in the repository, in `apps/web/content/rehber/`, one Markdown file per
**topic**, and ships inside the application. It is never stored in, or edited from, the database
or the UI.

Each file starts with frontmatter:

```yaml
---
id: listings                 # kebab-case, unique; the URL is /rehber/<id>
title: İlanlar
section: screens             # start | concepts | screens | faq | troubleshooting | glossary
order: 20                    # sort within the section
module: seller               # seller | brand | null
routes:                      # the app pages this topic documents; [] for non-screen topics
  - /listings
  - /listings/[id]
---
```

- Route patterns use the app directory's own spelling (`[id]`, `[marketplace]/[ref]`).
- `module` equals `moduleForPath(route)` (`apps/web/src/lib/module-routes.ts`) for every route the
  topic claims (§8 test 3).
- **A page open to both modules** is owned by one topic with `module: null`. Text that applies to
  only one module goes in a separate module-tagged topic the shared topic links to. There are no
  per-paragraph module markers.

### 2.1 Sections

| `section` | Shown as | Contents |
|---|---|---|
| `start` | Başlangıç | From a fresh install to daily use: first administrator and sign-in, setup wizard, licence, marketplaces, fees and policy, modules, stock import, turning automation on safely; ends with a checklist |
| `concepts` | Temel Kavramlar | Floor price, buybox, cost / commission / cargo, how a repricing decision is made, automation and the stop controls, roles, competitor data as reporting only |
| `screens` | Ekranlar | One topic per screen or screen group; every page is claimed by exactly one topic |
| `faq` | Sık Sorulanlar | Central FAQ; each answer links to its topic. Screen topics also end with their own _Sık sorulanlar_ |
| `troubleshooting` | Sorun Giderme | Symptom → likely causes in order → what to check on which screen → when to contact the installer |
| `glossary` | Sözlük | Terms |

## 3. Writing rules

- Turkish; second person plural ("… tıklayın"); short sentences.
- **Describe the code in the same commit, not the spec ahead of it.** A feature that is specified
  but not shipped has no guide text and no "yakında" notes. Where spec and code disagree, that is a
  defect to fix (CLAUDE.md); the guide follows the fix, in the same commit.
- Name UI elements **exactly** as the UI labels them, in bold: **Fiyatı Güncelle**.
- Where an action needs a permission, name the roles that have it ("Bu işlem Yönetici ve Fiyat
  Yöneticisi rollerine açıktır") rather than leaving it out: a viewer must learn why a button is
  missing.
- Never from `reference/legacy-app/`.
- **No internal names:** job class names, API paths, table or column names, environment variables,
  or how competitor data is collected. A setting the customer types in the UI is named exactly as
  the UI shows it.
- **No break-glass procedure** (doc 18 §8.3); that is the installer's, not the customer's.
- Money examples in whole TL, VAT-inclusive (doc 02 §0); never a VAT formula.
- No screenshots (§10).
- Each file ends with an HTML comment naming the spec sections it was written from:
  `<!-- kaynak: doc 03 §2, doc 06 §5 -->`. It is not rendered; it tells the next editor what to
  re-read. Other raw HTML is not rendered either.

## 4. Embedding

The installer ships Next's standalone output, which does not carry files read from disk at
runtime (doc 14 §4.2, §8). The content is therefore **inside the server bundle**:
`apps/web/scripts/generate-guide.mjs` reads `content/rehber/*.md` and writes
`apps/web/src/lib/guide/generated.ts` (gitignored), which the guide library parses. The generator
runs before `dev`, `build`, `test` and `typecheck`.

## 5. The `/rehber` screen

- `/rehber` — a search box, then topics by section in §2.1 order; screen topics in sidebar order.
- `/rehber/[id]` — one topic, with the topic list beside it and the topic's headings.
- Guarded like every page (`requirePermission('view')`, doc 18 §7.2): every signed-in role may
  read it.
- **Filtered by module only.** A topic whose module is switched off at this install is not
  listed, not searched, and its URL is not found; links to it render as plain text. Topics are
  **not** filtered by permission (§3).
- **Search** is client-side over title, headings and body, with Turkish case folding
  (`toLocaleLowerCase('tr-TR')`), so "ilan" finds "İlanlar". Title matches rank first, then
  headings, then body.
- Sidebar: **Rehber** in the **Sistem** group.

## 6. Header control

The header carries one "?" link (_Bu ekranın rehberi_). It maps the current path to the topic
whose `routes` contains it — segment by segment, a `[x]` segment matching any one non-empty
segment, the pattern with the fewest dynamic segments winning — and opens `/rehber/<id>`. With no
match it opens `/rehber`.

## 7. Keeping the guide current

**Rule: any change that alters what a user sees or does updates the guide in the same commit.**
This binds people and agents alike; agents in particular.

Triggers:

- a page added, removed, renamed or moved;
- a column, filter, button, field, menu item, default value, or a label's wording changed;
- a flow's steps or their order changed (setup wizard, import, sweep, approval…);
- a permission or role mapping changed;
- a user-visible error or warning message changed or added;
- a setting added, removed, or its meaning changed;
- a behaviour the guide explains changed (for example, when automation will not move a price).

Not triggers: refactors, performance work, test-only changes, internal job changes with no
visible effect.

**Report line.** An agent's final report for any change under `apps/web`, or any change to
user-visible behaviour, ends with exactly one of:

- `Rehber: güncellendi (<topic ids>)`
- `Rehber: etkilenmedi — <neden>`

## 8. Tests

In `apps/web`, run with the normal suite:

1. **Coverage:** every `page.tsx` under `apps/web/src/app` (outside `api/`) is claimed by exactly
   one topic's `routes` — the public pages (login, MFA, bootstrap) included.
2. **No dead routes:** every route a topic claims exists as a `page.tsx`.
3. **Module consistency:** a topic's `module` equals `moduleForPath(route)` for every route it
   claims.
4. **Links:** every internal link (`/rehber/<id>`, `/rehber/<id>#<heading>`) resolves.
5. **Embedding is current:** the generated module lists exactly the files in the content folder.

Malformed frontmatter (missing `title`, unknown `section` or `module`, bad `id`, duplicate `id`,
a route not starting with `/`) fails with the file's name in the message.

These catch a new page without a guide and a guide for a page that is gone. They cannot catch a
changed label or flow inside an existing page; that rests on §7 and on review.

## 9. Sign-in help

The guide is behind sign-in; there is no public guide route and doc 18 §7.3 is unchanged. The
login screen and the MFA step instead carry one static note, verbatim:

> Şifrenizi veya doğrulama kodunuzu kaybettiyseniz yöneticinize başvurun; yönetici
> **Kullanıcılar** ekranından sıfırlayabilir.

The guide's sign-in topic is written for the administrator who does the reset. If the users
screen's name changes, the note changes with it (§7).

## 10. Content authorship and review

Agents write the content. Each screen topic is checked against the running application: every
label, column, button and message it names is compared with what the screen shows (or the
labels source it renders), and the agent's report lists the screens checked. The product owner
reads **Başlangıç** and **Sorun Giderme**; the rest is accepted on the agent's check.

## 11. Out of scope

- Editing the guide in the UI; guide content in the database.
- An English version.
- Screenshots. Images cannot be checked by §8 and go stale silently. If added later they live
  under `public/rehber/`, each owned by a topic.
- A public (signed-out) guide.
- Contact details, a contact form, ticketing or chat — they differ per install.
