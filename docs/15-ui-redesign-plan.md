# 15 — UI redesign plan (task-oriented pass over every screen)

**Status:** plan only. Nothing in phases 1–7 is built yet. Phase 0 (`/`, the dashboard) shipped
2026-09-05 and is the reference implementation — read it before starting anything here.

This document is written to be handed to one agent per screen. An agent working a screen reads
**§1–§4 and its own row in §6**, and nothing else in this file. Do not read all the briefs.

---

## 1. What this is and why

The UI was built entity-first: each screen renders what its endpoint returns, in the order the
endpoint returns it. That is why `/` carried six equally-weighted sections and left the operator
to combine them into a judgement, and it is why the same defect appears on nearly every screen.

This pass re-ranks each screen by **the task its user came to do**. It is not a visual refresh.
A screen that comes out of this pass looking identical but answering its user's question three
seconds sooner has succeeded; a prettier screen with the same information architecture has not.

### The single rule

> **Do not mirror the backend model onto the screen.** An entity with 30 properties does not mean
> 30 fields. Classify by the user's task: **Primary** (needed to finish the task, visible at a
> glance) → **Supporting** (helps them decide) → **Secondary** (occasionally needed) →
> **Advanced** (exceptional/technical). Only Primary and Supporting are open by default.

### Measured baseline (2026-09-06)

Counted over the **26 `*-client.tsx` files** under `apps/web/src/app` (`/` included, which is the
one already done). Setup steps, `nav-shell.tsx` and small components such as `coverage-badge.tsx`
and `seller-identity-panel.tsx` are outside this denominator and carry the same defects.

Reproduce any row with the command beside it. These are counts, not impressions; each is a defect
class this pass closes.

| Finding | Count | How to reproduce / meaning |
|---|---|---|
| Files with a retry affordance after a failed load | **1 of 26** | `grep -rl "Tekrar dene"` — only `/`. 25 files strand the user on a dead end |
| Files using any `aria-*` attribute | **3 of 26** | `dashboard` (10 uses), `jobs` (4), `tracked-products` (3). Everything else has none |
| Files with `.catch(() => …)` swallowing a failure | **17 of 26** | The user is told nothing; the screen just stays empty |
| Files rendering absolute timestamps (`formatDateTime`) | **17 of 26** | The user computes staleness in their head |
| Files using relative time (`formatDuration`) | **4** | `alerts`, `competitors`, `jobs`, `dashboard` — the pattern exists and is barely used |
| Grid screens with column preferences (R-UI-12) | **5 of ~14** | Spec requirement, not rolled out |
| Screens with a CSV export (R-UI-13) | **14** | Better, but uneven |
| Ad-hoc `*_LABELS` maps | **8 maps across 5 files** | Each screen invents its own Turkish vocabulary |
| Screens conflating loading and error in one line | **≥2** | e.g. `alerts-client.tsx:692` — `{error ?? 'Yükleniyor…'}` |

**No screen in this app is covered by a rendering test.** All 12 test files under `apps/web` are
pure-function tests in `lib/`, and there is no vitest config at all. Phase 1c fixes this before any
screen is touched, and from then on a screen without a smoke test is not done (§4 step 6).

**The single largest structural defect:** the shared form kit lives at
`apps/web/src/app/setup/ui.tsx` and five Settings screens import it as `'../../setup/ui'`. A
settings screen reaching into the wizard's folder for its buttons is backwards, and it is why the
kit has never grown past six components. Phase 1 fixes this first.

---

## 2. Hard rules for every agent on this pass

Violating any of these fails the task regardless of how the screen looks.

### Do not break the product

1. **Money is `bigint` in minor units (kuruş).** Never a float, never a `number`. Format only at
   the display boundary, through `lib/format.ts`. This is a project-wide rule (`CLAUDE.md`), not
   a UI preference.
2. **Do not change an API route** unless the brief says to. If a screen needs a field the route
   does not return, say so in your report and work with what exists. A UI pass that quietly
   changes an endpoint's shape breaks the jobs and the worker that also read it.
3. **Do not change business logic.** No pricing, no thresholds, no decision branches. If you
   think a rule is wrong, report it; do not fix it here.
4. **Never remove a safety confirmation on an action that sends money, prices or credentials to
   a marketplace.** You may add one; you may remove one only from the *safe* direction of a
   switch (see §3.6).
5. **Do not touch `reference/legacy-app/`.** It is quarantined.

### Do not fragment the design system

6. **Read `apps/web/src/components/ui.tsx` before writing any component.** After Phase 1 that is
   the shared kit. If a component there solves your problem, use it. If it *nearly* does, extend
   it there — do not fork it into your screen.
7. **Colour only through the tokens** in `globals.css` (`--color-*`). Never a raw Tailwind palette
   class (`bg-red-500`), or the screen breaks in dark mode.
8. **Never let colour be the only carrier of meaning** (WCAG 2.2 AA, 1.4.1). Every badge, count,
   row highlight and bar carries a word too. Test: does the screen still read in greyscale?
9. **No new dependency.** No component library, no icon package, no date library. `formatDuration`
   already exists; so does `PriceChart`.

### Do not invent language

10. **No English enum reaches the screen** (R-UI-11). Translations live in
    `apps/web/src/lib/labels.ts` — add to it, never re-declare a map in your screen. If you find a
    local `*_LABELS` map, move it there.
11. **Turkish, in the operator's words**, not the schema's. `FinanceDocument.Status =
    PendingApproval` is the anti-pattern; so is `state: confirmed`.
12. **Never invent a value the data does not carry.** If a field is unknown, say "bilinmiyor" or
    omit the row — do not show a plausible-looking zero. A count of `0` next to data that was
    never collected reads as "nothing is wrong" and is the most dangerous thing this UI can do.

---

## 3. The shared contract (what "done" looks like on every screen)

### 3.1 One primary action

Each screen has **one** visually dominant action — the reason the user opened it. Secondary
actions are quieter. Tertiary actions live in a menu or a `<details>`. **Destructive actions are
never styled like the primary action.**

Some screens (the dashboard, `/jobs`) have triage as their primary action rather than a button.
That is legitimate: the "action" is then the single CTA on the highest-ranked item.

### 3.2 Six states, every time

Every screen must handle all six explicitly. Missing states are the most common defect in the
baseline.

| State | Requirement |
|---|---|
| **Loading** | Says what is loading. Never share a line with the error state. |
| **Empty** | Says *why* it is empty and what to do — "Henüz ilan yok. Stok içe aktarıldıktan sonra burası dolar." Never a bare "Kayıt yok." |
| **Error** | Says what failed, and carries a **"Tekrar dene"** button. Never a silent `.catch(() => …)` on the screen's primary load. |
| **Stale** | A screen that auto-refreshes must say when its data is from, and say so loudly when a refresh fails over already-loaded data. |
| **Busy** | A control mid-request is disabled and says so ("Kaydediliyor…"), and the result is confirmed or the error is shown. Never fire-and-forget. |
| **Permission / disabled** | A control the user cannot use says why, not just `disabled`. |

The reference for all six is `dashboard-client.tsx` (`DashboardClient`'s early returns, the
stale-refresh banner, `PriceSubmissionSwitch`'s busy/error handling).

### 3.3 Time

Elapsed time (`formatDuration` + " önce"), with the absolute value in `title`. Use the `Ago`
component from the shared kit. Absolute time is correct only where the exact instant is the point
(an audit record, a log line's own column).

### 3.4 Tables

Choose columns by the decision the user makes in the list, not by what the row object holds. A
user scanning a row must be able to answer, without opening anything:

- What is this?
- What state is it in?
- Is there a problem?
- Do I need to act?
- What is the most likely next action?

Rare columns go behind `useColumnPrefs` (R-UI-12) or a detail view. Grid furniture comes from
`components/table.tsx` — `TableFrame`, `STICKY_HEAD`, `usePagedRows`, `Pagination`, `ColumnMenu`,
`ResizableTh`. **Do not render a pager over a bounded list that can never page** — the dashboard
carried a 25-per-page control over 15 rows, which reads as a promise of more behind it.

### 3.5 Forms

Group fields logically; mark required vs optional; use sensible defaults; validate per field on
blur, not only on submit; never ask for something the system already knows. **Do not lay out a
long form on one screen just because the DTO is flat** — `settings/policy` is 19 fields in one
list and is the worst instance.

### 3.6 Confirmation asymmetry

Confirm the direction that creates risk. Do not confirm the direction that removes it.

- Turning price submission **on** → confirm. Turning it **off** → one click.
- Deleting → confirm, and the confirm names what is being deleted.
- A confirm on a safe action trains the user to click through the dangerous one.

### 3.7 Accessibility floor (WCAG 2.2 AA)

- Every screen has exactly one `<h1>`; sections are `<section aria-labelledby>` with an `<h2>`.
- Everything interactive is a real `<button>`, `<a>`/`Link`, `<details>`/`<summary>`, or a labelled
  form control. Never a `div` with `onClick`.
- Progress bars carry `role="progressbar"` with `aria-valuenow/min/max` and a Turkish
  `aria-valuetext`.
- Content that changes without user action (a poll, a live run) sits in `aria-live="polite"`.
- Icon-only buttons carry `aria-label`.
- Visible focus is never removed.

### 3.8 Responsive

Information hierarchy survives the collapse to one column: verdict/primary first, advanced last.
Wide tables scroll inside their own container; the page body never scrolls horizontally.

---

## 4. Per-screen procedure

Follow this in order. **Do not start writing the screen until step 3 is written down.**

**Step 1 — Read.** The screen's client, its `page.tsx`, the API routes it calls, and the section
of `docs/06-user-interface.md` that specifies it. Read `dashboard-client.tsx` once for the target
shape. Read `components/ui.tsx` and `components/table.tsx` for what already exists.

**Step 2 — Derive, do not assume.** From the code and the domain, answer: who uses this screen,
why they came, their main task, their most frequent actions, their occasional and exceptional
actions, and what they need in order to decide. Ground each answer in something you read. Where
the code cannot tell you, say "unknown" and pick the safest reading — do not invent a persona.

**Step 3 — Write the UX evaluation.** Post this in your report *before* coding:

```
## User
## Primary Goal
## Primary Action
## Key Information (Primary)
## Supporting Information
## Secondary / Advanced Information
## Current UX Problems      <- each with a file:line citation
## Proposed Information Architecture
## Proposed Interaction Flow
```

A problem without a citation is an impression, not a finding. Cite like
`alerts-client.tsx:692`.

**Step 4 — Implement.** Against §2 and §3. Reuse before you build.

**Step 5 — Update the spec.** `docs/06-user-interface.md` is authoritative; when the code and the
spec disagree, one of them is changed *deliberately and stated*. If your new IA departs from the
section describing your screen, rewrite that section (see §2 of that doc for the shape — it was
rewritten this way on 2026-09-05).

**Step 6 — Test, then verify.** Write a smoke test for your screen, next to it, named
`<screen>-client.test.tsx`. Copy the structure from `dashboard-client.test.tsx` (Phase 1c) and the
helpers from `src/test-utils.tsx`. Four cases, each with its own `fetch` stub: **loading, error
(including the retry button), empty, populated.** Assert one stable phrase per state — not layout,
not class names, no snapshots. A screen without this test is not done.

Then all four commands must pass; paste the output in your report:

```
npm run typecheck
npx eslint <files you touched>
npx prettier --check <files you touched>     # --write, then re-check
npm run test --workspace=apps/web
```

Then re-answer the 12 review questions in §5 and report honestly. `git checkout --
apps/web/next-env.d.ts` if a build touched it.

**Step 7 — Report.** What changed, what you deliberately left alone, and anything you found that
is out of scope (a wrong business rule, a missing API field, a defect on another screen). Do not
fix out-of-scope findings; report them.

### Do not run the app

`apps/web/data/app.db` is a **live install** carrying real Trendyol credentials and real history.
`SINGLE_PROCESS=1` starts the embedded worker against it. Verify with typecheck, lint and tests.
If a change genuinely cannot be verified without running the app, say so and stop — the product
owner decides.

---

## 5. Final review questions

Re-answer all 12 after implementing, with a one-line justification each:

1. Does the user understand what the screen is for within 3–5 seconds?
2. Is the primary action unmistakable?
3. Is there unnecessary information or visual noise?
4. Is the user required to memorise anything?
5. Is system state always legible?
6. Can we prevent an error rather than report it?
7. Is there an unnecessary confirmation or modal?
8. Can the same task be done in fewer steps?
9. Is the domain user's terminology used?
10. Any keyboard or accessibility problem?
11. Consistent with the existing design system?
12. Is the information hierarchy preserved on mobile and desktop?

---

## 6. Phases and screen briefs

**Phase 1 is a hard dependency for everything after it.** If Phase 1 is skipped, every screen
invents its own `Chip` and the pass produces 25 dialects instead of one system.

Within a phase, screens are independent and can be worked in parallel. **One agent per screen.**
Two agents must never hold the same file, and only the Phase 1 agent may edit
`components/ui.tsx`.

---

### Phase 1 — Groundwork (2 sessions, blocks everything)

**One agent. No other screen work starts until this merges.** Two sessions: 1a+1b are one,
1c is the other. 1c may be done by a second agent in parallel with 1a+1b — it touches no file
they touch — but both must land before Phase 2 starts.

**1a. Create `apps/web/src/components/ui.tsx`** by moving `app/setup/ui.tsx` there and absorbing
the dashboard's local primitives. Update the six importers (five Settings screens + the setup
steps). Leave `app/setup/ui.tsx` gone, not re-exporting — a second path is how the split
persists.

The kit must contain, at minimum:

| Export | Source | Notes |
|---|---|---|
| `Field`, `TextInput`, `Select`, `Button`, `StatusBanner`, `StepFooter` | existing `setup/ui.tsx` | Move as-is; do not redesign yet |
| `Tone` type + `TONE_BOX` / `TONE_TEXT` maps | `dashboard-client.tsx` | `'ok' \| 'warn' \| 'danger' \| 'neutral'` |
| `Chip` | `dashboard-client.tsx` | Status badge; always carries a word |
| `Section` | `dashboard-client.tsx` | `<section aria-labelledby>` + `<h2>` + optional action slot |
| `Ago` | `dashboard-client.tsx` | Relative time, absolute in `title` |
| `PageHeader` | new | One `<h1>` + optional description + primary action slot |
| `EmptyState` | new | Message + reason + optional CTA. Forbids a bare "Kayıt yok." |
| `ErrorState` | new | Message + **"Tekrar dene"** button. Signature `{ message, onRetry }` |
| `LoadingState` | new | `aria-live="polite"`; optional skeleton rows |
| `ConfirmButton` | new | Wraps the §3.6 asymmetry so screens stop hand-rolling `window.confirm` |

Add a short doc comment to each explaining *why it exists*, matching the density of the existing
comments in `components/table.tsx`. This repo comments the reasoning, not the mechanics.

**1b. Complete `apps/web/src/lib/labels.ts`.** Move all eight ad-hoc `*_LABELS` maps into it:

- `alerts-client.tsx:90,97,103,108` — `SCOPE_LABELS`, `SUBJECT_LABELS`, `PREDICATE_LABELS`, `THRESHOLD_LABELS`
- `events-client.tsx:27` — `LEVEL_LABELS` (note: currently maps `debug` → `'debug'`, untranslated)
- `jobs-client.tsx:201` — `CIRCUIT_LABELS`
- `tracked-product-detail-client.tsx:54` — `STATUS_LABELS`
- `cross-marketplace-client.tsx:46` — `MARKETPLACE_LABELS`

Also add: job names (`JOB_LABELS`) — `/jobs` currently shows raw `JOB_CATALOG` identifiers.

**1c. Do not restyle anything in this phase.** Phase 1 is a move-and-consolidate. Screens must
render identically when it merges, so that any visual change later is attributable to that
screen's own agent.

**1c. Stand up the screen-test harness.** There is no rendering test in this repo today: all 12
test files under `apps/web` are pure-function tests in `lib/`, and there is **no vitest config
anywhere** — vitest runs on defaults. Without this step, the other six phases are 12,900 lines of
UI change whose only verification is a person clicking. With it, most of that becomes a check that
runs on every commit.

**Read this before starting — three traps that will each cost an hour if hit blind:**

1. **The `@/` alias does not resolve in tests.** Every existing test imports relatively
   (`from './format'`); *no* test uses `@/`. Screens import `@/lib/format`, `@/components/table`.
   The alias is declared only in `tsconfig.json` `paths`, which vitest does not read. A config
   with an explicit `resolve.alias` is mandatory, not optional.
2. **Screens fetch on mount.** Every client screen calls `fetch` in a `useEffect`. Tests must stub
   `globalThis.fetch` per case; an unstubbed test hits the network and hangs or fails obscurely.
3. **`next/navigation` throws outside a router.** `/listings` and others call `useSearchParams`;
   `nav-shell` calls `usePathname`. These need `vi.mock('next/navigation', …)`.

Install (React 19.2.8 / Next 16.3.0 / Vitest 4.1.10 are what is on disk — pick versions that match):

```
npm i -D --workspace=apps/web @testing-library/react @testing-library/dom jsdom
```

`@testing-library/react` must be v16 or later for React 19; `@testing-library/dom` is its peer and
is not installed transitively.

Create `apps/web/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom', globals: false },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
```

Verify the 12 existing `lib/` tests still pass under `jsdom` before writing anything new. They are
pure functions and should be unaffected; if one breaks, the environment is the suspect, not the
test.

**Then write the reference smoke test: `apps/web/src/app/dashboard-client.test.tsx`.** It covers
the screen already rebuilt, so it is written against known-good behaviour and becomes the template
every later agent copies. It must assert **four states**, each with its own `fetch` stub:

| Case | Stub | Assert |
|---|---|---|
| Loading | a `fetch` that never resolves | the loading text renders; no crash |
| Error | `fetch` rejects | the error message **and** the "Tekrar dene" button render |
| Empty | 200 with empty collections | the empty-state sentence renders, not a bare blank |
| Populated | 200 with a realistic body | the verdict headline and at least one row render |

**Scope discipline — this is a smoke test, not a characterisation test.** It proves the screen
renders each state without throwing and shows the right top-level message. It does **not** assert
layout, class names, colours, or exact copy beyond one stable phrase per state. **No snapshot
files** — a snapshot over a screen this pass is about to rewrite is a test that fails on every
intended change and teaches everyone to run `-u` without reading.

Put the fetch-stub and `next/navigation`-mock helpers in `apps/web/src/test-utils.tsx` so 25 later
agents do not each invent their own.

**Done when:** `grep -rn "_LABELS: Record" apps/web/src/app` returns nothing;
`grep -rn "setup/ui" apps/web/src` returns nothing; `apps/web/vitest.config.ts` exists;
`dashboard-client.test.tsx` covers all four states and passes; the 12 pre-existing tests still
pass; typecheck, lint and prettier pass; `git diff --stat` shows no change to rendered output.

---

### Phase 2 — Tier A: full IA rework (7 sessions, 5,908 lines)

These screens have genuinely wrong hierarchy. Full §4 procedure including the written evaluation.

| # | Screen | Lines | Known issues (verified) | Likely primary task |
|---|---|---|---|---|
| 2.1 | `/jobs` `jobs-client.tsx` | 1,202 | Raw job identifiers; raw run `state`; 6 absolute timestamps; only 4 `aria-*`; the `SchedulerBanner` doc comment contradicts `/api/jobs`, which always sends `scheduler` | "Bir iş takıldı mı, ve neden?" |
| 2.2 | `/tracked-products` | 1,017 | 4 absolute timestamps; has column prefs and filter presets already — build on them, do not replace | "Rakip ürünlerde fiyat ne yapıyor?" |
| 2.3 | `/alerts` | 979 | `:692` conflates loading and error; 8 absolute timestamps; 4 local label maps; a `window.confirm` to audit against §3.6 | "Hangi alarm açık ve ne yapmalıyım?" |
| 2.4 | `/watched-brands/findings` | 827 | 10 absolute timestamps — the most in the app; a second nested loading state at `:740`; no `aria-*` | "Markamı kim kurallara aykırı satıyor?" |
| 2.5 | `/listings` | 734 | The main working grid. 13 columns; column prefs are the reference implementation — preserve them. `?phases=` seeding was added 2026-09-05 | "Bu ilanın fiyatı neden bu, ve müdahale etmeli miyim?" |
| 2.6 | `/stock` | 576 | No column prefs (R-UI-12 gap); has CSV | "Maliyetler doğru mu?" |
| 2.7 | `/watched-brands` | 573 | 3 absolute timestamps; no column prefs | "Hangi markaları izliyorum, taramalar sağlıklı mı?" |

**2.1 note:** `/jobs` is where the dashboard's attention rows land ("İşler ekranı"). Those links
must arrive somewhere that answers the question they were clicked for. Do this screen first in
this phase.

---

### Phase 3 — Tier B: detail screens (3 sessions, 2,784 lines)

Detail screens are progressive-disclosure problems, not hierarchy problems: the information is
right, the layering is not. Abbreviated evaluation (§4 step 3) is acceptable — 3–4 sentences per
heading.

| # | Screen | Lines | Notes |
|---|---|---|---|
| 3.1 | `/competitors/sellers/[marketplace]/[ref]` | 686 | 9 absolute timestamps; has column prefs + CSV |
| 3.2 | `/watched-brands/policy` | 572 | Import flow + grid; check the import's error reporting against §3.2 |
| 3.3 | `/watched-brands/sellers` | 557 | Plus `seller-identity-panel.tsx` (2 timestamps) |
| 3.4 | `/listings/[id]` | 537 | **R-UI-8 lives here** — the price must be explainable without reading logs. Now imports shared labels; the waterfall is the Primary information |
| 3.5 | `/tracked-products/[id]` | 432 | 8 absolute timestamps; local `STATUS_LABELS` (moved in Phase 1) |

---

### Phase 4 — Tier C: consistency pass (3.5 sessions, 2,117 lines)

**Not a redesign.** These screens are single-purpose and their hierarchy is broadly right. Apply
§3 only: shared components, Turkish labels, the six states, relative time, accessibility floor,
and the confirmation asymmetry. Skip §4 step 3's full evaluation; a one-paragraph justification
of what you changed and what you left is enough.

| # | Screen | Lines | Notes |
|---|---|---|---|
| 4.1 | `/competitors` | 484 | Already uses `formatDuration` — follow its lead |
| 4.2 | `/competitors/sellers` | 351 | Loading state at `:211` |
| 4.3 | `/settings/fees` | 283 | Form; check §3.5 grouping |
| 4.4 | `/watched-brands/comparison` | 272 | |
| 4.5 | `/settings/policy` | 253 | **19 flat fields — the worst §3.5 instance.** Group into: strateji / kâr koruma / stok / hız ve bütçe. This one earns a full evaluation despite the tier |
| 4.6 | `/events` | 250 | `LEVEL_LABELS` maps `debug`→`debug`; the log is Advanced information by nature |
| 4.7 | `/watched-brands/cross-marketplace` | 224 | |

---

### Phase 5 — Tier D: small screens (1.5 sessions, 787 lines)

One agent may take all six in one session. Consistency pass only.

`/settings/marketplaces` (206) · `/settings/product-sources` (181) · `/license` (154) ·
`/brands` (104) · `/settings/retention` (94) · `/settings/database` (48)

`/settings/marketplaces` carries credentials — §2 rule 4 applies, and check it against
`credential-merge.ts`'s contract before touching the form.

---

### Phase 6 — Setup wizard (1 session, 931 lines)

Eight steps + `ui.tsx` (moved in Phase 1), treated as **one flow, one agent**. This is the only
screen a new user ever sees first, and it is full-bleed (`NavShell` bails out on `/setup`).

Focus: per-field validation over end-of-step validation; never re-ask for something an earlier
step established; every step states what happens if the user stops here. Do not change what the
wizard *writes* — only how it asks.

---

### Phase 7 — Shell and final consistency sweep (1 session)

`nav-shell.tsx` (228 lines): 2 silently swallowed fetches, the system-pause button and the
licence grace banner. Then a sweep across everything Phases 1–6 touched, re-running the §5
questions app-wide and reporting drift. The sweep agent **reports** inconsistencies; it does not
fix them unless they are one-line.

---

## 7. Budget and sequencing

Estimates below **include** writing each screen's smoke test (§4 step 6). That is roughly a 15%
overhead per screen, and it is stated here rather than hidden: an earlier draft of this plan
totalled 18 sessions without tests, and quoting that number alongside a test requirement would
have been an estimate that could only be met by skipping the tests.

| Phase | Screens | Redesign | + tests | Parallelisable |
|---|---|---|---|---|
| 1 — Groundwork (1a/1b kit + labels, 1c harness) | — | 1 | **2** | No — blocks all (1a+1b and 1c may run side by side) |
| 2 — Tier A | 7 | 7 | **8** | Yes, after 1 (do 2.1 `/jobs` first) |
| 3 — Tier B | 5 | 3 | **3.5** | Yes, after 1 |
| 4 — Tier C | 7 | 3.5 | **4** | Yes, after 1 |
| 5 — Tier D | 6 | 1.5 | **2** | Yes, after 1 |
| 6 — Setup | 1 flow | 1 | **1.5** | Yes, after 1 |
| 7 — Shell + sweep | 1 | 1 | **1** | No — last |
| **Total** | **26** | 18 | **~22** | |

### If the whole pass is too much

The honest cut is **not** "do every screen more cheaply" — Tiers C and D are already a consistency
pass, so there is little left to shave. The cut is **fewer screens now**:

**Phases 1, 2, 6, 7 → ~12.5 sessions.** This covers the groundwork, the seven screens whose
hierarchy is actually wrong, the wizard every new user meets first, and the shell. Tiers B–D keep
working exactly as they do today, and pick them up later — they inherit the shared kit, the
labels and the test harness, so the deferred work gets cheaper, not more expensive.

**Phase 1c is never what gets cut.** It is what makes everything after it verifiable, and it is
the one piece whose value survives even if the pass stops early.

### Why the test harness is in Phase 1 and not optional

`typecheck` + `eslint` + `prettier` + pure-function tests prove a screen *compiles and is
internally consistent*. They prove nothing about whether it still renders. Before Phase 1c, the
only thing standing between a broken screen and production is a person opening it — and across the
25 remaining screens that is the schedule's real critical path, not the writing.

The smoke tests do not remove human review; they change what it is for. A reviewer who no longer
has to check "does this screen crash on an empty result / a failed fetch" can spend the time on
the thing a test cannot judge: **is the hierarchy right, and is this the word the operator uses?**
Budget roughly 15 minutes per screen for that judgement — call it 6–7 hours across the pass, down
from 10–13.

Two limits worth stating plainly, so nobody over-trusts the green tick:

- A smoke test asserts one phrase per state. It will not catch a wrong column order, an
  unreadable colour pair, a control that is technically present but visually buried, or Turkish
  that is grammatical and still wrong for the domain. Those are exactly the defects this pass
  exists to fix, and only a person sees them.
- These run against stubbed `fetch`, not the live install. They say nothing about whether the API
  shape a screen assumes is the shape the route actually returns — that is what `typecheck`
  covers, and only because the interfaces are hand-written on both sides.

Consider a Playwright pass over the five highest-traffic screens once the pass is complete, as a
separate piece of work. Chromium is already installed (for the scraper), so the marginal cost is
the tests themselves. Out of scope here.

---

## 8. Definition of done for the pass

- Every screen satisfies §3 in full.
- `grep -rn "_LABELS: Record" apps/web/src/app` → nothing.
- `grep -rn "setup/ui" apps/web/src` → nothing.
- Every screen's primary load has an error state with a retry; no `.catch(() => …)` on a primary
  load.
- Every grid screen has column preferences (R-UI-12) and a CSV export (R-UI-13), closing the gaps
  `docs/06-user-interface.md` §10 already records.
- `docs/06-user-interface.md` describes the screens as they now are.
- Every screen has a passing smoke test covering loading, error+retry, empty and populated.
- `apps/web/vitest.config.ts` exists and the `@/` alias resolves in tests.
- No snapshot files anywhere under `apps/web`.
- Typecheck, lint, prettier and tests pass across the workspace.
