# UI Redesign · Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen of `apps/web` picks up the Lacivert palette (light and dark), IBM Plex,
lucide icons, the extended kit and the redesigned shell, without any screen file being edited.

**Architecture:**
- Token values change in `globals.css` while the token names stay the same. Every screen already
  reads colour through `--color-*`, so the new palette spreads to them without edits.
- The kit in `components/ui.tsx` and `components/table.tsx` grows only through optional props.
  Existing call sites therefore restyle without being touched.
- `nav-shell.tsx` keeps every behaviour and changes layout and look only.

**Tech Stack:** Next.js 16.3 (App Router), React 19, Tailwind v4, Vitest with jsdom and Testing
Library, `next/font/google`, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-11-03-ui-redesign-design.md`, §3–§5 and §7. Phases 2 and 3
get their own plans.

## Global Constraints

- **Presentation only.** No API route, job, business rule or money calculation changes. Money
  stays `bigint` up to the display boundary.
- **Colour only through tokens.** Never use a raw Tailwind palette class such as `bg-red-500`
  (doc 15 rule 7). New colours become tokens in `globals.css`.
- **Colour is never the only carrier of meaning.** Every tone also renders its word (doc 15
  rule 8).
- **Dependency exception.** The only new dependency is `lucide-react`; IBM Plex comes through
  `next/font/google`. No other package is added (spec §2).
- **Labels.** Turkish UI strings stay Turkish. Existing labels do not change wording; the tests
  assert on them.
- **Imports.** A `'use client'` file imports only types from `@buybox/*`. This is guarded by
  `src/client-imports.test.ts`.
- **No live database.** Never run the app against `apps/web/data/app.db`. It is a live install
  with real marketplace credentials. Use a copy with the price jobs gated (Task 9).
- **Running tests.** Run from `apps/web/`. The whole suite is `npx vitest run`; one file is
  `npx vitest run <path>`. The typecheck is `npm run typecheck`.

## Review Focus

These are the failure modes the spec implies but no task's own tests exercise. Each line names
the test that pins it and the task that owns that test.

1. **Explicit theme vs system theme.** Choosing "Açık" on a dark-preferring OS must still render
   light, so the media-query dark block and the `[data-theme='dark']` block must stay identical.
   Pinned by `dark blocks are identical` (Task 1).
2. **Turkish glyphs in IBM Plex.** ş, ğ, ı, İ, ç, ö and ü must not fall back to another font.
   The font must load the `latin-ext` subset. Pinned by `loads latin-ext` (Task 2).
3. **localStorage unavailable** (private mode, blocked storage). The collapsed-rail preference
   must fall back silently instead of throwing. Pinned by `readStoredNavCollapsed survives a
   throwing storage` (Task 7).
4. **The icon rail hides text.** In the rail, every nav link must keep an accessible name, or the
   existing `getByRole('link', { name })` tests and screen readers break. Pinned by `collapsed
   rail keeps link names` (Task 7).
5. **Dashboard payload missing or failing.** The freshness pill must render nothing instead of
   an error when `/api/dashboard` fails, returns null sections, or has a module switched off.
   Pinned by `scanFreshness` table tests and `pill absent on error` (Task 8).

---

## Deliberate change to the spec

Spec §4.2 says `Section` "becomes a card". `Section` is used 52 times across 22 screens, and many
of them already wrap a bordered `TableFrame` or `EmptyState`. If every one of them turned into a
card in Phase 1, those screens would show a card inside a card until Phases 2 and 3 reached them.

This plan therefore adds the card look as an **opt-in prop**, `card`, which defaults to `false`.
Phase 1 restyles the plain `Section` heading only. The Phase 2 and 3 plans set `card` on each
screen as they convert it. Task 4 updates spec §4.2 to say this.

The spec also names the prop `PageHeader.actions`. This plan keeps the existing name, `action`,
because 21 call sites already pass it. A caller with several actions passes a fragment.

## File map

| File | Responsibility | Task |
|---|---|---|
| `apps/web/src/lib/contrast.ts` (new) | WCAG relative luminance and contrast ratio for `#rrggbb` | 1 |
| `apps/web/src/app/theme-tokens.test.ts` (new) | Parses `globals.css`; asserts the contrast rules and that the two dark blocks are identical | 1 |
| `apps/web/src/app/globals.css` | Token values, new tokens, fonts, table look | 1, 2, 6 |
| `apps/web/src/app/fonts.ts` (new) | `next/font` IBM Plex Sans and Mono instances | 2 |
| `apps/web/src/app/layout.tsx` | Applies the font variables to `<html>` | 2 |
| `apps/web/src/components/icon.tsx` (new) | The only lucide import point | 3 |
| `apps/web/src/components/ui.tsx` | Kit changes and new components | 4, 5 |
| `apps/web/src/components/ui.test.tsx` (new) | Kit tests | 4, 5 |
| `apps/web/src/components/table.tsx` | `TableFrame` as a card | 6 |
| `apps/web/src/lib/nav-collapse.ts` (new) | Read and store the rail preference | 7 |
| `apps/web/src/app/nav-shell.tsx` | Sidebar, header, collapse | 7, 8 |
| `apps/web/src/lib/scan-freshness.ts` (new) | Derives the header pill from the `/api/dashboard` payload | 8 |
| `apps/web/src/app/nav-shell.test.tsx` | Shell tests, existing and new | 7, 8 |
| `docs/06-user-interface.md` §11, `docs/15-ui-redesign-plan.md` rule 9, `docs/08-configuration-and-constants.md` | Docs | 1, 3 |

---

### Task 1: Lacivert tokens, the contrast test, doc 06 §11

**Files:**
- Create: `apps/web/src/lib/contrast.ts`
- Create: `apps/web/src/app/theme-tokens.test.ts`
- Modify: `apps/web/src/app/globals.css:14-144`, the `:root` block and both dark blocks
- Modify: `docs/06-user-interface.md` §11 (from line 797), up to §12

**Interfaces:**
- Produces:
  - `contrastRatio(a: string, b: string): number`, which accepts `#rrggbb` only;
  - every token in spec §3.2 and §3.3 except `--font-sans` / `--font-mono` (those are Task 2).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/app/theme-tokens.test.ts` with `// @vitest-environment node`. Read
`globals.css` from `path.join(SRC_APP_DIR, 'globals.css')`, resolving the directory the same way
`src/client-imports.test.ts` does. Write a helper
`block(css: string, selector: string): Record<string, string>` that returns the custom properties
declared in the first `{…}` after `selector`. There are three selectors:

- `':root {'`
- `":root:not([data-theme='light'])"`
- `":root[data-theme='dark']"`

Tests:

```ts
it('dark blocks are identical', () => {
  expect(block(css, ":root:not([data-theme='light'])")).toEqual(block(css, ":root[data-theme='dark']"));
});

it('no neon value survives', () => {
  for (const v of ['#22d3ee', '#05070a', '#ff3b47', '#16e37e']) expect(css.toLowerCase()).not.toContain(v);
});

describe.each([['light', ':root {'], ['dark', ":root[data-theme='dark']"]])('%s contrast ≥ 4.5', (_, sel) => {
  const t = () => block(css, sel);
  it.each(['danger', 'warning', 'success'])('%s on bg, surface and its own -bg', (s) => {
    for (const ground of [t()['--color-bg'], t()['--color-surface'], t()[`--color-${s}-bg`]])
      expect(contrastRatio(t()[`--color-${s}`], ground)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['accent', 'danger', 'warning', 'success'])('%s-ink on solid %s', (s) => {
    expect(contrastRatio(t()[`--color-${s}-ink`], t()[`--color-${s}`])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['muted', 'link'])('%s on bg and surface', (k) => {
    for (const g of [t()['--color-bg'], t()['--color-surface']])
      expect(contrastRatio(t()[`--color-${k}`], g)).toBeGreaterThanOrEqual(4.5);
  });
  it('sidebar text on sidebar', () => {
    expect(contrastRatio(t()['--color-sidebar-text'], t()['--color-sidebar'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t()['--color-sidebar-active-text'], t()['--color-sidebar-active-bg'])).toBeGreaterThanOrEqual(4.5);
  });
});
```

Add a small `contrastRatio` table test in the same file:

| Pair | Expected ratio |
|---|---|
| `#000000` / `#FFFFFF` | 21 |
| `#FFFFFF` / `#FFFFFF` | 1 |
| `#777777` / `#FFFFFF` | ≈ 4.48 |

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/theme-tokens.test.ts`

Expected: FAIL. `contrast.ts` does not exist yet.

- [ ] **Step 3: Implement `contrastRatio` in `apps/web/src/lib/contrast.ts`**

Use the WCAG 2.x relative luminance formula: sRGB channel ÷ 255, linearised with the 0.04045
threshold, weighted 0.2126 / 0.7152 / 0.0722. The ratio is `(L1 + 0.05) / (L2 + 0.05)` with the
lighter value on top. Throw on any input that is not `#rrggbb`.

- [ ] **Step 4: Rewrite the token blocks in `globals.css`**

- Set every value in spec §3.2.
- Add every token in spec §3.3 except the fonts. In the light block, set `--color-link` to the
  literal `#2B59C3`, not `var(--color-accent)`, so the test can parse it.
- Copy the dark values into both dark blocks, character for character.
- Rewrite the file's header comment and the dark-block comment so they name Lacivert, the
  2026-11-03 decision, and the fact that it replaces the neon theme. Keep the "status hue
  contrast" comment, update its numbers, and point it at the test.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/theme-tokens.test.ts`

Expected: PASS.

If a pair fails, adjust that value in both the light and the dark block as needed until it
passes. Record the changed value in spec §3.2 or §3.3 in the same commit.

- [ ] **Step 6: Rewrite doc 06 §11**

- Retitle it "Theme — Lacivert (light and dark)".
- State the 2026-11-03 decision and that it replaces Option 2 of 2026-08-18.
- Replace the neon token table with the spec §3.2 and §3.3 tables.
- Keep §11.1, the contrast audit, as history. Add one line saying the audit is now enforced by
  `theme-tokens.test.ts`.

- [ ] **Step 7: Run the whole suite and the typecheck**

Run: `npx vitest run && npm run typecheck`

Expected: both pass. Some existing tests may assert a token class string; such a test passes
unchanged, because only the token values changed.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/contrast.ts apps/web/src/app/theme-tokens.test.ts apps/web/src/app/globals.css docs/06-user-interface.md docs/superpowers/specs/2026-11-03-ui-redesign-design.md
git commit -m "Replace the neon theme with the Lacivert palette and enforce its contrast in a test"
```

---

### Task 2: IBM Plex through `next/font`

**Files:**
- Create: `apps/web/src/app/fonts.ts`
- Create: `apps/web/src/app/fonts.test.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`, in the `body` rule and `.tabular-figures`

**Interfaces:**
- Produces:
  - `plexSans` and `plexMono`, the `next/font/google` instances, exposed as the CSS variables
    `--font-plex-sans` and `--font-plex-mono`;
  - the tokens `--font-sans` and `--font-mono` in `globals.css`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/fonts.test.ts` with `// @vitest-environment node`. It reads `fonts.ts`
as text, because `next/font` cannot run under Vitest, and asserts three things:

- `loads latin-ext`: the source contains `'latin-ext'` twice, once for each font.
- `sans weights`: the source contains `IBM_Plex_Sans` and `weight: ['400', '500', '600', '700']`.
- `mono weights`: the source contains `IBM_Plex_Mono` and `weight: ['400', '500', '600']`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/fonts.test.ts`

Expected: FAIL with ENOENT.

- [ ] **Step 3: Create `fonts.ts`**

Follow `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` exactly.

```ts
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

export const plexSans = IBM_Plex_Sans({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], variable: '--font-plex-sans', display: 'swap' });
export const plexMono = IBM_Plex_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600'], variable: '--font-plex-mono', display: 'swap' });
```

Add a doc comment explaining two things. First, the fonts are downloaded at **build** time and
served by the app itself, so a customer browser never calls Google; this matters on the NAT'd
production server. Second, the `latin-ext` subset is what covers Turkish.

- [ ] **Step 4: Wire the fonts in**

- In `layout.tsx`, set `className={\`${plexSans.variable} ${plexMono.variable}\`}` on `<html>`.
- In `globals.css`, add `--font-sans: var(--font-plex-sans), ui-sans-serif, system-ui, sans-serif;`
  and `--font-mono: var(--font-plex-mono), ui-monospace, Consolas, monospace;` to `:root`.
- `body` uses `font-family: var(--font-sans)`.
- `.tabular-figures` uses `font-family: var(--font-mono)` and keeps `tabular-nums`.

- [ ] **Step 5: Run the test, the typecheck and a production build**

Run: `npx vitest run src/app/fonts.test.ts && npm run typecheck && npm run build`

Expected: all three pass. The build needs internet access once, to fetch the fonts.

If `docs/14-deployment.md` §8 builds on a machine with no internet, stop and report. The
fallback would be `next/font/local` with committed `.woff2` files, and that is a spec decision,
not the implementer's.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/fonts.ts apps/web/src/app/fonts.test.ts apps/web/src/app/layout.tsx apps/web/src/app/globals.css
git commit -m "Set the app in IBM Plex Sans and Mono, self-hosted through next/font"
```

---

### Task 3: `lucide-react`, the `Icon` component, the dependency exception in docs

**Files:**
- Modify: `apps/web/package.json`, adding `"lucide-react": "^1.67.0"` to `dependencies`
- Create: `apps/web/src/components/icon.tsx`
- Create: `apps/web/src/components/icon.test.tsx`
- Modify: `docs/15-ui-redesign-plan.md` rule 9
- Modify: `docs/08-configuration-and-constants.md`, adding a line where dependencies or build
  inputs are listed, or a short "UI dependencies" note if no such place exists

**Interfaces:**
- Produces: `Icon({ icon, size = 16, className, label }: { icon: LucideIcon; size?: 16 | 18 | 20; className?: string; label?: string })`.
  - Without `label`, the icon is decorative and renders `aria-hidden="true"`.
  - With `label`, it renders `role="img"` and `aria-label={label}`.
  - The stroke width is always `1.8`.
  - Every later task imports icon components from `lucide-react` **only** through
    `components/icon.tsx`, which re-exports the ones in use, e.g.
    `export { LayoutDashboard, Package, … } from 'lucide-react'`.

- [ ] **Step 1: Install the package**

Run from the repo root: `npm install lucide-react@^1.67.0 -w @buybox/web`

Expected: `package.json` and the lockfile change, and nothing else.

- [ ] **Step 2: Write the failing tests**

In `icon.test.tsx`:

- `decorative by default`: render `<Icon icon={Package} />`. The `svg` has
  `aria-hidden="true"`, `width="16"`, and `stroke-width="1.8"`.
- `labelled`: render `<Icon icon={Package} label="Stok" />`. Then
  `getByRole('img', { name: 'Stok' })` exists.
- `only import point`: a node-environment test, written in the style of `client-imports.test.ts`.
  It asserts that no file under `src/`, other than `components/icon.tsx`, contains
  `from 'lucide-react'`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/icon.test.tsx`

Expected: FAIL. `icon.tsx` does not exist yet.

- [ ] **Step 4: Implement `icon.tsx`**

Implement the `Icon` signature from the Interfaces block above.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/icon.test.tsx`

Expected: PASS.

- [ ] **Step 6: Record the exception in the docs**

Rewrite doc 15 rule 9 to this exact sentence:

> **No new dependency** — except `lucide-react` (icons) and IBM Plex through `next/font/google`,
> authorised by the product owner on 2026-11-03 (`docs/superpowers/specs/2026-11-03-ui-redesign-design.md` §2).
> Still no component library and no date library.

Add the same fact to doc 08 in one line.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/src/components/icon.tsx apps/web/src/components/icon.test.tsx docs/15-ui-redesign-plan.md docs/08-configuration-and-constants.md
git commit -m "Add lucide-react behind a single Icon component, as an authorised exception to doc 15 rule 9"
```

---

### Task 4: Extend the existing kit components

**Files:**
- Modify: `apps/web/src/components/ui.tsx`, covering Field, TextInput, Select, Button, Chip,
  Section, PageHeader, EmptyState, ErrorState and LoadingState
- Create: `apps/web/src/components/ui.test.tsx`
- Modify: `docs/superpowers/specs/2026-11-03-ui-redesign-design.md` §4.2, the Section bullet

**Interfaces:**
- Consumes: `Icon` and `LucideIcon` from Task 3.
- Produces the following signatures. Every addition is optional.

```ts
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; icon?: LucideIcon } &
  ({ children: React.ReactNode } | { children?: undefined; 'aria-label': string });
Chip({ tone, children, title, dot }: { …; dot?: boolean })
Section({ id, title, action, children, card }: { …; card?: boolean })   // card defaults to false
PageHeader({ title, description, action, breadcrumb }: { …; breadcrumb?: { label: string; href?: string }[] })
TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon })
```

- [ ] **Step 1: Write the failing tests in `ui.test.tsx`**

- `Button variants`:
  - `danger` has a class containing `--color-danger`.
  - `ghost` has no border class.
  - `size="sm"` is shorter than `md` (assert on the class).
- `icon-only button needs a label`:
  - Render `<Button icon={Trash2} aria-label="Sil" />`. Then `getByRole('button', { name: 'Sil' })`
    exists.
  - Add a `// @ts-expect-error` line rendering `<Button icon={Trash2} />` with no label and no
    children. The typecheck must reject it.
- `Chip keeps its word`: for each tone in `['ok','warn','danger','neutral']`,
  `<Chip tone={t} dot>Uyumlu</Chip>` renders the text `Uyumlu`. With `dot`, there is an
  `aria-hidden` dot element.
- `Section card is opt-in`:
  - Without `card`, the `<section>` has no `--shadow-card` class.
  - With `card`, it has one.
  - In both cases the heading id is wired to `aria-labelledby`.
- `PageHeader breadcrumb`: `breadcrumb={[{label:'Marka Denetimi', href:'/'},{label:'Takip Edilen Ürünler'}]}`
  renders a `nav` with `aria-label="Konum"`. Its first item is a link and its last item has
  `aria-current="page"`.
- `TextInput icon`: with `icon={Search}`, the input is still `getByRole('textbox')`, and the icon
  is `aria-hidden`.
- `ErrorState retry`: clicking `Tekrar dene` calls `onRetry`. This pins the label now that the
  component is rebuilt on `Button`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ui.test.tsx`

Expected: FAIL on the new props.

- [ ] **Step 3: Implement the changes in `ui.tsx`**

These visual values are fixed by the spec:

**Button**
- Height: `md` is `h-9 px-4`, `sm` is `h-8 px-3 text-xs`.
- Corners: `rounded-lg`.
- Styles by variant:
  - `primary` is the accent fill with `-ink` text;
  - `secondary` is a surface background with a border;
  - `danger` is the danger fill with `--color-danger-ink` text;
  - `ghost` is transparent and uses `--color-hover` on hover.
- When `icon` is set, it is rendered with `Icon` at size 16, before the children.

**Chip**
- `rounded-full px-2.5`.
- `dot` adds a `size-1.5 rounded-full bg-current` span with `aria-hidden`.

**Section**
- Restyle the plain heading to `text-[15px] font-semibold text-(--color-text)`, no longer
  uppercase and muted.
- With `card`, wrap it in `rounded-xl border bg-(--color-surface) shadow-(--shadow-card) p-5`.

**PageHeader**
- The title is `text-2xl font-bold`.
- The breadcrumb sits above the title in `text-xs text-(--color-muted)`, with `/` separators that
  are `aria-hidden`.

**TextInput / Select**
- `h-9 rounded-lg`, with `focus:ring-2 focus:ring-(--color-accent-border)`.
- The icon variant wraps the input in a `relative` span and positions the icon inside the input.

**EmptyState / ErrorState / LoadingState**
- Leading icons: `Inbox`, `AlertTriangle` and `Loader2` (spinning, `motion-safe:animate-spin`).
- ErrorState's button becomes `<Button variant="secondary">`.
- All copy stays the same.

Re-export the icons used here from `icon.tsx`. Update the existing doc comments so they mention
the new props.

- [ ] **Step 4: Run the kit tests**

Run: `npx vitest run src/components/ui.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run the whole suite and the typecheck**

Run: `npx vitest run && npm run typecheck`

Expected: both pass. A screen test that asserted an exact class string of a kit component would
fail here. If one does, update that assertion to the new string; do not change the component back.

- [ ] **Step 6: Edit the spec §4.2 Section bullet**

Change it to say that the card is opt-in through `card`, that it defaults to `false`, and that
the Phase 2 and 3 plans opt each screen in. Copy the reason from "Deliberate change to the spec"
above.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/ui.tsx apps/web/src/components/ui.test.tsx apps/web/src/components/icon.tsx docs/superpowers/specs/2026-11-03-ui-redesign-design.md
git commit -m "Extend the kit with button variants, icons, pill chips, breadcrumbs and opt-in card sections"
```

---

### Task 5: New components: StatCard, SegmentedFilter, VerdictBanner

**Files:**
- Modify: `apps/web/src/components/ui.tsx`
- Modify: `apps/web/src/components/ui.test.tsx`

**Interfaces:**
- Consumes: `Tone`, `TONE_TEXT`, `TONE_BOX` and `Button` from `ui.tsx`, and `Icon` from Task 3.
- Produces:

```ts
StatCard({ label, value, delta, tone }: { label: string; value: React.ReactNode; delta?: React.ReactNode; tone?: Tone })
SegmentedFilter<V extends string>({ label, options, value, onChange }: {
  label: string;                                   // the group's aria-label
  options: readonly { value: V; label: string; count?: number; tone?: Tone }[];
  value: V; onChange: (v: V) => void;
})
VerdictBanner({ tone, title, detail, action }: { tone: Tone; title: string; detail?: React.ReactNode; action?: React.ReactNode })
```

- [ ] **Step 1: Write the failing tests**

**`StatCard`**
- `StatCard renders label, value and delta`: label `Açık bulgu`, value `14`, delta
  `↑ 6 · geçen hafta 8`. All three texts are present.
- With `tone="danger"`, the value element's class contains `--color-danger`.
- The value element has the `tabular-figures` class.

**`SegmentedFilter`**
- `is a labelled group of pressed buttons`:
  - With options Tümü 128, Tavsiye altı 14 (tone danger) and Sınırda 9 (tone warn), and
    `value="all"`, `getByRole('group', { name: 'Durum' })` exists.
  - The button whose accessible name contains `Tümü` has `aria-pressed="true"`, and the others
    have `false`.
  - Clicking `Sınırda` calls `onChange('warn')`.
  - The count `14` is visible text, so the tone never carries the meaning alone.

**`VerdictBanner`**
- `VerdictBanner announces its title`: `tone="warn"` and
  `title="Sistem ilerliyor, 2 konu ilginizi bekliyor"`.
- `getByRole('status')` contains the title.
- The title uses `--color-warning-strong` when the tone is `warn`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ui.test.tsx`

Expected: FAIL, because the new components do not exist yet.

- [ ] **Step 3: Implement the three components**

**StatCard**
- A card with `rounded-xl border bg-(--color-surface) shadow-(--shadow-card) px-5 py-4`.
- The label is `text-[13px] text-(--color-muted)`.
- The value is `tabular-figures text-3xl font-semibold`.
- The delta is `text-xs text-(--color-muted)`.

**SegmentedFilter**
- A `div role="group" aria-label={label}` holding joined buttons.
- The selected button uses `bg-(--color-strong-bg) text-(--color-strong-ink)`.
- A tone colours the label of an unselected button only.
- Use native buttons; no roving tabindex. That is enough for keyboard use, because Tab plus Enter
  or Space already works.

**VerdictBanner**
- A `div role="status"` with `TONE_BOX[tone]`.
- A leading round icon:
  - `CheckCircle2` for `ok`;
  - `AlertTriangle` for `warn` and for `danger`;
  - `PauseCircle` for `neutral`.
- The title is a `font-bold text-[17px]` heading. Its colour is `--color-warning-strong` for
  `warn`, and `TONE_TEXT[tone]` otherwise.
- `action` is placed on the right.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ui.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui.tsx apps/web/src/components/ui.test.tsx apps/web/src/components/icon.tsx
git commit -m "Add StatCard, SegmentedFilter and VerdictBanner to the kit"
```

---

### Task 6: Table look

**Files:**
- Modify: `apps/web/src/components/table.tsx:36-60`, the `TableFrame` frame class
- Modify: `apps/web/src/app/globals.css`, the `.table-frame` and `.table-sticky-head` rules
- Modify: `apps/web/src/components/ui.test.tsx`, adding a `TableFrame` case, or create
  `table.test.tsx` if no table test exists

**Interfaces:**
- Consumes: the `--color-thead`, `--color-line` and `--shadow-card` tokens from Task 1.
- Produces: no new API. `TableFrame`'s props are unchanged.

- [ ] **Step 1: Write the failing test**

`TableFrame is a card`: the rendered frame's class contains `rounded-xl`, `bg-(--color-surface)`
and `shadow-(--shadow-card)`, and it still contains `table-frame`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/table.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement**

- Change `TableFrame`'s class to
  `table-frame rounded-xl border border-(--color-border) bg-(--color-surface) shadow-(--shadow-card)`.
- In `globals.css`, put the new table rules inside `@layer components { … }`.
  - **Why the layer matters:** in Tailwind v4, unlayered CSS beats every utility. Without the
    layer, a screen's own `th`/`td` utility classes would stop working.
- The rules to add:
  - `.table-frame thead th`: `background: var(--color-thead)`, `font-size: 12px`,
    `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: .03em`,
    `color: var(--color-muted)`.
  - `.table-frame tbody td`: `border-bottom: 1px solid var(--color-line)`.
  - `.table-frame tbody tr:hover`: `background: var(--color-hover)`.
- In `.table-sticky-head th`, change the background to `var(--color-thead)`.
- The `.row-*` classes stay exactly as they are. A row highlight must still win over hover, so
  hover applies only to `tr:not([class*='row-'])`.

- [ ] **Step 4: Run the test, the suite and the typecheck**

Run: `npx vitest run && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/table.tsx apps/web/src/app/globals.css apps/web/src/components/table.test.tsx
git commit -m "Set every grid in a card with a tinted header row and line dividers"
```

---

### Task 7: Shell — sidebar, user block, icon rail

**Files:**
- Create: `apps/web/src/lib/nav-collapse.ts`
- Create: `apps/web/src/lib/nav-collapse.test.ts`
- Modify: `apps/web/src/app/nav-shell.tsx`, covering `NAV_GROUPS` (lines 76–118), `UserMenu`
  (304–344) and the `NavShell` layout (378–431)
- Modify: `apps/web/src/app/nav-shell.test.tsx`

**Interfaces:**
- Consumes: `Icon` and its icon re-exports (Task 3), plus `Button` and `SegmentedFilter`
  (Tasks 4–5).
- Produces:
  - `readStoredNavCollapsed(): boolean | null`;
  - `storeNavCollapsed(collapsed: boolean): void`;
  - `NAV_COLLAPSE_STORAGE_KEY = 'buybox.navCollapsed'`;
  - `NAV_GROUPS` items gain `icon: LucideIcon`.

- [ ] **Step 1: Write the failing tests**

In `nav-collapse.test.ts`, with the same shape as `nav-modules` uses for `readStoredNavView`:

- `round-trips`: storing `true` makes the read return `true`; storing `false` makes it return
  `false`.
- `nothing stored reads null`.
- `readStoredNavCollapsed survives a throwing storage`: stub `window.localStorage.getItem` to
  throw. The read returns `null`, and the store does not throw.

In `nav-shell.test.tsx`, add `afterEach` cleanup of `buybox.navCollapsed`, then:

- `collapsed rail keeps link names`: store `true` and render. `getByRole('link', { name: 'Panel' })`
  and `getByRole('link', { name: 'İşler' })` still resolve.
- `rail toggle`: clicking `getByRole('button', { name: 'Menüyü daralt' })` makes it
  `Menüyü genişlet`, and stores `'1'`.
- `user block lives in the sidebar`: with `/api/auth/me` stubbed,
  `within(getByRole('complementary')).getByRole('button', { name: 'Çıkış yap' })` exists.
- Every existing test in the file passes unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/nav-collapse.test.ts src/app/nav-shell.test.tsx`

Expected: the new tests FAIL and the existing ones PASS.

- [ ] **Step 3: Implement `nav-collapse.ts`**

- Store `'1'` or `'0'`.
- Wrap every storage call in try/catch, as `storeNavView` already does.

- [ ] **Step 4: Implement the shell changes**

**`NAV_GROUPS` icons**

| Item | Icon |
|---|---|
| Panel | `LayoutDashboard` |
| Stok | `Package` |
| İlanlar | `Tags` |
| Markalar | `Bookmark` |
| Rakip Geçmişi | `History` |
| Rakip Satıcılar | `Users` |
| Alarmlar | `Bell` |
| İzlenen Markalar | `Eye` |
| Takip Edilen Ürünler | `ScanSearch` |
| Marka Satıcıları | `Store` |
| Satıcı Politikası | `ShieldCheck` |
| Denetim Bulguları | `AlertTriangle` |
| Pazaryeri Eşleşmesi | `GitCompare` |
| Marka Karşılaştırması | `BarChart3` |
| İşler | `Cog` |
| Olaylar | `ScrollText` |
| Ayarlar | `Settings` |

**`<aside>`**
- `w-60` when expanded and `w-16` when collapsed, on `bg-(--color-sidebar)`.
- At the top: a 32px rounded accent tile holding a `ShoppingBag` icon, then `BuyBoxApp` in
  `text-white` and the module name in `--color-sidebar-muted`. The module name is
  `Marka Denetimi` when only `brand` is shown, `Satış` when only `seller` is shown, and nothing
  when both are shown.
  - The white text and the tile's ink use a new token, `--color-sidebar-strong`, which is
    `#FFFFFF` in both themes. Add it to all three blocks in `globals.css`, and to spec §3.3.
- Group titles: `text-[11px] uppercase tracking-wider text-(--color-sidebar-muted)`. They are
  hidden when collapsed.
- Items:
  - an icon at 18, then the label;
  - inactive items are `text-(--color-sidebar-text)` with a hover of `bg-white/5`;
  - the active item is `bg-(--color-sidebar-active-bg) text-(--color-sidebar-active-text) font-semibold`
    with `aria-current="page"`.
- When collapsed, the label is visually hidden with `sr-only` and the link gets
  `title={item.label}`. The accessible name stays the label.

**User block**
- Move it to the bottom of the `<aside>` with `mt-auto`, keeping the poll, `readOnly` and sign-out
  logic unchanged.
- When collapsed, show only an initials avatar plus the `LogOut` icon-only button with
  `aria-label="Çıkış yap"`.

**Collapse toggle**
- A ghost icon-only `Button` at the foot of the sidebar: `PanelLeftClose` or `PanelLeftOpen`,
  with `aria-label` `Menüyü daralt` or `Menüyü genişlet`.
- Initial state, after mount:
  - the stored value if there is one;
  - otherwise `window.matchMedia('(max-width: 1023px)').matches`, guarded because jsdom has no
    `matchMedia`.

**Header**
- Rebuild `ViewSwitch` on `SegmentedFilter` with `label="Menü görünümü"`.
- Restyle `SystemPauseButton`'s `className` to match `Button`'s `md` sizes. Keep `ConfirmButton`,
  the labels and the tone logic unchanged.
- Restyle the theme toggle only if it renders a raw button.

Keep every doc comment that explains a behaviour, and add one line to the `NAV_GROUPS` comment
about icons.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/nav-collapse.test.ts src/app/nav-shell.test.tsx && npm run typecheck`

Expected: PASS, including every existing shell test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/nav-collapse.ts apps/web/src/lib/nav-collapse.test.ts apps/web/src/app/nav-shell.tsx apps/web/src/app/nav-shell.test.tsx apps/web/src/components/icon.tsx apps/web/src/app/globals.css
git commit -m "Redesign the shell: dark icon sidebar, user block at its foot, collapsible rail"
```

---

### Task 8: Header scan-freshness pill (measurement-gated)

**Files:**
- Create: `apps/web/src/lib/scan-freshness.ts`
- Create: `apps/web/src/lib/scan-freshness.test.ts`
- Modify: `apps/web/src/app/nav-shell.tsx`, adding a `ScanFreshness` component on the left of
  `<header>`
- Modify: `apps/web/src/app/nav-shell.test.tsx`

**Interfaces:**
- Consumes these fields of the `/api/dashboard` payload, as typed in `dashboard-client.tsx:92-127`.
  Declare a local structural type; do not import from a client screen.
  - `brandAudit: { brands: { marketplaceCode: string; lastSweptAt: number | null }[] } | null`
  - `competitorAlerts?: { coverage: { marketplaceCode: string; displayName: string; lastOkAt: number | null; stale: boolean }[] } | null`
  - `modules?: { seller: boolean; brand: boolean }`
- Produces:
  `scanFreshness(payload: DashboardFreshnessInput): { marketplaceCode: string; label: string; at: number | null; tone: 'ok' | 'warn' }[]`.

**Rule, decided here because the spec does not say:**
- **Brand.** The pill shows the latest `lastSweptAt` per `marketplaceCode`, with tone `ok`. The
  brand payload carries no staleness flag, and inventing a threshold would be a business rule.
- **Seller.** The pill uses `coverage`, with tone `warn` when `stale` is true.
- **Both modules on.** When a marketplace appears on both sides, the seller entry wins, because
  only it has a staleness judgement.
- **Labels.** `label` is the `displayName` when the seller side provides one. Otherwise it comes
  from the existing marketplace label in `lib/labels.ts`. Check that file; do not add a new map.

- [ ] **Step 1: Write the failing table tests**

In `scan-freshness.test.ts`:

| Case | Input | Expected |
|---|---|---|
| brand-only, two brands on the same marketplace | `TY` at 1000 and `TY` at 3000 | one `TY` entry, `at` 3000, tone `ok` |
| never swept | every `lastSweptAt` is `null` | one entry, `at: null` |
| seller stale | `stale: true` | tone `warn` |
| `brandAudit: null` and no `competitorAlerts` | — | `[]` |
| both modules, same marketplace | brand and seller entries | the seller entry |

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scan-freshness.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement `scanFreshness`**

Write it as a pure function that matches the table above.

- [ ] **Step 4: Add `ScanFreshness` to the header and write its shell tests**

**Component**
- Fetch `/api/dashboard` once with the existing `usePoll` hook; it fetches on mount only.
- While loading or on error, render nothing.
- Otherwise, render one `Chip` per entry with `dot`. The text is `{label} · <Ago at={at} never="henüz taranmadı" />`.

**Shell tests**
- `pill shows the latest sweep`: stub `/api/dashboard` with a brand-only payload. The text
  `Trendyol` is present inside `getByRole('banner')`.
- `pill absent on error`: `/api/dashboard` returns 500. The banner contains no `Trendyol`, and
  every other header control still renders.
- The existing tests do not stub `/api/dashboard`. Check how `stubFetch` handles an unstubbed
  route. If it throws or rejects, the pill must swallow that silently.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/scan-freshness.test.ts src/app/nav-shell.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Measurement gate (spec §5.3)**

Set up the database copy and the app:

1. Copy `apps/web/data/app.db` to the scratchpad. Find the gating environment variables in
   `docs/07-processes-and-jobs.md` and `docs/08-configuration-and-constants.md`, and start the app
   against the copy with the price jobs gated.
2. If you cannot find a gating variable that you are sure of, **stop and ask**. Do not start the
   app.

Then load `/` and one other page and read the `/api/dashboard` timing from the server log or the
browser network panel.

- **Under 300 ms:** keep the pill.
- **At or over 300 ms:** remove `ScanFreshness` from the header (keep `scan-freshness.ts` and its
  tests) and record the measured time in spec §5.3.

Either way, put the number in the commit message.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/scan-freshness.ts apps/web/src/lib/scan-freshness.test.ts apps/web/src/app/nav-shell.tsx apps/web/src/app/nav-shell.test.tsx docs/superpowers/specs/2026-11-03-ui-redesign-design.md
git commit -m "Show each marketplace's last scan in the header (/api/dashboard measured at <N> ms)"
```

---

### Task 9: Phase verification

**Files:** none, unless a check fails.

- [ ] **Step 1: Run the full suite, the typecheck and the build**

Run from `apps/web/`: `npx vitest run && npm run typecheck && npm run build`

Expected: everything passes.

- [ ] **Step 2: Check the screens visually**

Use the database copy and the gated price jobs from Task 8, step 6. Open each of these screens
in light, dark and system theme:

- `/`
- `/tracked-products`
- `/watched-brands/findings`
- `/settings`
- `/jobs`

Check each of them for:

- no light-on-light or dark-on-dark text;
- Turkish characters rendered in Plex;
- the active nav item correct;
- the rail working below 1024px;
- grid row highlights still visible.

- [ ] **Step 3: Report**

List every screen that looks broken, with a screenshot path, as input for the Phase 2 plan. Do
not fix screen files in Phase 1.
