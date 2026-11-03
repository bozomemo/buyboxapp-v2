# UI Redesign · Phase 3 (The Rest) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every remaining screen under `apps/web/src/app/` uses the kit:
- the seller screens (Stok, İlanlar, Markalar, Rakip Geçmişi, Rakip Satıcılar, Alarmlar);
- İşler, Olaylar and Ayarlar;
- Hesabım;
- sign-in, MFA, bootstrap and setup;
- the licence screen;
- the shell, and the three detail screens.

At the end, a guard test over the **whole** of `app/` proves that no file hand-rolls a control.

**Architecture:**
- **One guard for all of `app/`.**
  - Task 1 turns `kit-adoption.test.ts` from Phase 2's opt-in `CONVERTED` list into a walk of
    every `.tsx` file under `app/`.
  - Files that are still unconverted sit on a shrinking `PENDING` list, and a pending file must
    still violate, so the list cannot go stale.
  - Each later task removes its files from `PENDING` (the guard fails), then converts them until
    the guard passes.
  - The last task proves `PENDING` is empty and deletes it.
- **Pattern-driven conversion** (spec §6.1). Phase 2's shared conversion rules apply unchanged
  and are repeated below.
- **Existing behaviour is pinned.** The screen smoke tests already in the repo pin behaviour.
  They must keep passing unchanged, except where a label moves into a kit component.

**Tech Stack:** Next.js 16.3, React 19, Tailwind v4, Vitest with jsdom and Testing Library. This
phase adds no dependency.

**Spec:** `docs/superpowers/specs/2026-11-03-ui-redesign-design.md`, §6.2 Phase 3 and §7. Phases 1
and 2 are merged into `development`. The Phase 2 plan
(`docs/superpowers/plans/2026-11-03-ui-redesign-phase-2-brand-screens.md`) is the precedent for
every rule below.

## Global Constraints

- **Presentation only (spec §6.3).**
  - No API route, request parameter, data flow or business logic changes.
  - Money stays `bigint` up to the display boundary.
  - The CSV exports' `Number(x) / 100` is a pre-existing money-rule violation. It is **out of
    scope** here and belongs to the separate fix round. Do not touch those lines.
- **Colour.** Colour comes from tokens only, and a tone always comes with its word (doc 15 rules 7
  and 8).
- **Labels.**
  - A label that moves keeps its exact wording, because the tests assert on it.
  - A new label goes in `lib/labels.ts` only if it is an enum translation (doc 15 rule 10).
- **Kit API.** Use `components/ui.tsx`, `components/icon.tsx` and `components/table.tsx` as they
  are. This phase adds no kit component (spec §4.5).
- **Icons.** Import icons only through `components/icon.tsx`. Add re-exports there as needed.
- **No live database.** Never run anything against `apps/web/data/app.db`.
- **Running tests.** From `apps/web/`: `npx vitest run <path>`, the full suite `npx vitest run`,
  and `npx tsc --noEmit`. `npm run build` rewrites `next-env.d.ts`; revert it with
  `git checkout apps/web/next-env.d.ts`.
- **Line endings.** Many files are CRLF. Edit them so their line endings are preserved.
- **Out of scope.** The deferred minors from Phases 1 and 2 are not part of this plan.

## Review Focus

1. **Permission gating survives the rewrite.** The commonest regression is a gated button losing
   `disabled={!can(...)}` or `title={NO_PERMISSION_TITLE}` when it becomes a kit `Button`.
   - Pinned by `keeps permission gating` in Tasks 2, 3, 6 and 9.
2. **A numeric `<select>` stays numeric.** The kit `Select` takes string values.
   - Alarmlar's "Sessizlik süresi" holds milliseconds. It must still be POSTed as a number.
   - Pinned by `quiet period posts a number` in Task 9.
3. **A period filter shows the period that was picked.** Phase 2 shipped this bug: option values
   computed from `Date.now()` never equal the stored value after one render.
   - Every period filter converted here uses the Phase 2 fix: a `periodDays` state of
     `'7' | '30' | '90'` beside `sinceMs`.
   - Pinned by `period filter keeps its selection` in Tasks 7 and 8.
4. **No double enqueue on İşler.** "Şimdi çalıştır" must stay disabled while the job is queued
   or running, not only while the browser's POST is in flight.
   - Pinned by `run now stays disabled while queued` in Task 3.
5. **No state shown by colour alone.**
   - Setup's step list marks the current step only by fill today, and the settings tabs mark the
     current tab the same way.
   - After this phase, the current step carries `aria-current="step"`, the current tab carries
     `aria-current="page"`, and a done step carries a visible "✓".
   - Pinned by `current step is announced` in Task 11 and `active tab is marked` in Task 2.

---

## Shared conversion rules (apply in every screen task)

| Old | New |
|---|---|
| `<button className="rounded border …">` | `<Button variant="secondary" size="sm">`. Use `size="md"` only for a screen's primary action. |
| `<button className="rounded bg-(--color-accent) …">` (the screen's save or primary action) | `<Button size="md">` (variant primary). |
| `<button className="rounded bg-(--color-strong-bg) …">` | `<Button size="sm">` (variant primary). |
| A text-styled button whose label is an **action** ("düzenle", "Vazgeç", "Satır ekle", "Kuralları göster", "Farklı bir hesapla giriş yap") | `<Button variant="ghost" size="sm">`. Keep the exact label. |
| A destructive text button ("Sil", "×") | `<Button variant="ghost" size="sm" icon={Trash2}>` with the same visible text. An icon-only one gets `aria-label` from its old `title`. |
| A CSV or Excel export button | `<Button variant="secondary" size="sm" icon={Download}>`. Keep the label ("CSV İndir", "Excel'e Aktar"). |
| `<input>` of type text, number, search, date or datetime-local | `<TextInput>`, with the same `type`, `value`, handlers and `aria-label`. A search or lookup box gets `icon={Search}`. Keep a width class such as `w-20`. |
| `<select>` whose options come from data, or that has 4 or more fixed options | `<Select options={…}>`. A leading "— … seçin —" or "Tümü" option becomes `{ value: '', label: '<same text>' }`. Number values become `String(v)` in `value` and options, and `Number(e.target.value)` in `onChange`. |
| `<select>` with 2–3 fixed options picking one state | `<SegmentedFilter label="<old visible label>" options={…}>`, with the same values and labels. |
| A period `<select>` built from `daysAgo(7/30/90)` | `SegmentedFilter` with Phase 2's fix: `const [periodDays, setPeriodDays] = useState('30')` and `const [sinceMs, setSinceMs] = useState(() => daysAgo(30))`. The option values are `'7' \| '30' \| '90'`. `onChange={(v) => { setPeriodDays(v); setSinceMs(daysAgo(Number(v))); }}`. Keep the initial period the screen has today. |
| A page `<h1 className=…>` | `<PageHeader title=… breadcrumb={…}>` with the breadcrumb from the table below. |
| An existing `PageHeader` without a breadcrumb | Add the breadcrumb from the table below. |
| `<Section …>` | `<Section … card>`. A form screen's fields also sit in `max-w-[720px]` (spec §6.1, pattern 4). |
| A bordered `<div className="rounded border …">` used as a panel | `rounded-xl border border-(--color-border) bg-(--color-surface) p-4 shadow-(--shadow-card)`. |
| `className="px-2! py-1! text-xs"`, or any `px-…! py-…!` squeeze on a `Button` | Delete it and use `size="sm"`. |
| A comment that names `<button>` or `<select>` literally | Reword it ("the dropdown", "the button"). The guard reads comments too. |

**Breadcrumbs** (the group title from `NAV_GROUPS` in `nav-shell.tsx`, then the screen):

| Screen | `breadcrumb` |
|---|---|
| Seller screens | `[{ label: 'Satış' }, { label: '<menu label>' }]` |
| Seller detail screens | `[{ label: 'Satış' }, { label: '<list label>', href: '<list href>' }, { label: <record name> }]` |
| Tracked-product detail | `[{ label: 'Marka Denetimi' }, { label: 'Takip Edilen Ürünler', href: '/tracked-products' }, { label: <product name> }]` |
| İşler, Olaylar | `[{ label: 'Sistem' }, { label: 'İşler' \| 'Olaylar' }]` |
| Every settings page, including Lisans | `[{ label: 'Sistem' }, { label: 'Ayarlar' }]`. The page title stays "Ayarlar". |
| Kullanıcılar (its own PageHeader) | `[{ label: 'Sistem' }, { label: 'Ayarlar', href: '/settings' }, { label: 'Kullanıcılar' }]` |
| Hesabım | none. It is reached from the user menu, not from a group. |

**Allowed exceptions.** Mark each one with `{/* kit-exempt: <reason> */}` (or a `//` comment
inside an expression) on one of the two lines above it. These are the only reasons accepted:
- **combobox option:** an option row inside an autocomplete result list. Sites: alerts:223,
  competitors:247, events:220.
- **sort header:** sites: listings:948.
- **status chip is the toggle:** a word-carrying state that is itself the control, as on İzlenen
  Markalar in Phase 2. Sites: jobs:1022 ("Etkin" / "Devre dışı").
- **data cell is the control:** a table or list cell whose visible label is data, such as a
  product name or a price. Sites: listings:227 (price cell that opens the editor), stock:535
  (bundle name), tracked-product-detail:338 (seller row expander).
- **inline action within a sentence:** a "Tekrar dene" inside a banner's running text. Sites:
  nav-shell:270, stock:409, marketplaces:207.
- **sidebar ink:** this follows Phase 1's ruling. Kit `Button` colours lose to the sidebar's by
  CSS source order. Sites: nav-shell:385, nav-shell:500.
- **radio group:** `role="radio"` with `aria-checked`, which `SegmentedFilter`'s `aria-pressed`
  does not replace. Sites: mfa-challenge:113.
- **error headline inside the danger box:** sites: dashboard-client:1144.

The line numbers are from `3867cf6`. Find each site by its content, not by its number.

---

### Task 1: The guard covers all of `app/`

**Files:**
- Modify: `apps/web/src/app/kit-adoption.test.ts`

**Interfaces:**
- Produces:
  - `PENDING: readonly string[]`: paths relative to `app/`, using `/`. Each later task deletes
    its own entries.
  - `violations(source)` now also flags `<h1`.

- [ ] **Step 1: Write the failing tests**

- Add the row `['<h1 className="x">', 1]` to the `violations` table.
- Replace the `CONVERTED` describe block with two tests:
  - `every screen under app/ uses the kit`: walk `APP_DIR` recursively for `*.tsx` that is not
    `*.test.tsx`. For each file not in `PENDING`, expect `violations(source)` to equal `[]`.
  - `pending files still need converting`: for each file in `PENDING`, expect
    `violations(source).length` to be greater than 0. A converted file must leave the list.
- Delete `CONVERTED`. The walk now covers its files.
- `PENDING` starts as exactly these 35 files:
  - `account/account-client.tsx`
  - `account/mfa-setup/mfa-setup-client.tsx`
  - `account/password/password-client.tsx`
  - `alerts/alerts-client.tsx`
  - `brands/brands-client.tsx`
  - `competitors/competitors-client.tsx`
  - `competitors/sellers/sellers-client.tsx`
  - `competitors/sellers/[marketplace]/[ref]/seller-detail-client.tsx`
  - `dashboard-client.tsx`
  - `events/events-client.tsx`
  - `jobs/jobs-client.tsx`
  - `jobs/page.tsx`
  - `license/license-client.tsx`
  - `listings/listings-client.tsx`
  - `listings/[id]/listing-detail-client.tsx`
  - `login/mfa/mfa-challenge-client.tsx`
  - `nav-shell.tsx`
  - `settings/page.tsx`
  - `settings/database/page.tsx`
  - `settings/fees/page.tsx`
  - `settings/fees/fees-client.tsx`
  - `settings/marketplaces/page.tsx`
  - `settings/marketplaces/marketplaces-client.tsx`
  - `settings/modules/page.tsx`
  - `settings/policy/page.tsx`
  - `settings/product-sources/page.tsx`
  - `settings/product-sources/product-sources-client.tsx`
  - `settings/retention/page.tsx`
  - `settings/users/users-client.tsx`
  - `setup/setup-wizard.tsx`
  - `setup/steps/step1-database.tsx`
  - `setup/steps/step4-fees.tsx`
  - `setup/steps/step6-product-source.tsx`
  - `stock/stock-client.tsx`
  - `tracked-products/[id]/tracked-product-detail-client.tsx`
- If the walk finds another file that violates (for example a page with an `<h1>`), add it to
  `PENDING` and ledger a ruling that names the task that owns it. The owner is the task for the
  same screen.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/kit-adoption.test.ts`

Expected:
- the `<h1` table row FAILs;
- `pending files still need converting` FAILs on the files whose only violation is an `<h1`:
  the settings `page.tsx` files, `jobs/page.tsx`, `setup/setup-wizard.tsx` and
  `dashboard-client.tsx`. The guard cannot see them yet.

- [ ] **Step 3: Add `<h1\b` to the `violations` regex. If the walk then fails on a file missing from `PENDING`, add it as described above.**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "Guard every screen under app/ against hand-rolled controls, with a shrinking pending list".

---

### Task 2: Ayarlar (form pattern) and the settings tabs

**Files:**
- Modify: the eight `settings/**/page.tsx` files from `PENDING`
- Modify: `settings/settings-nav.tsx`
- Modify: the four settings clients from `PENDING`
- Modify: the `Section`s of `database-client.tsx`, `modules-client.tsx`, `policy-client.tsx` and
  `retention-client.tsx`
- Create: `settings/settings-nav.test.tsx`
- Modify: the existing settings client tests only where a label moved
- Modify: `kit-adoption.test.ts`, removing the 12 settings entries from `PENDING`

**Screen changes:**
- **Every settings `page.tsx`.** Replace `<h1 …>Ayarlar</h1>` with
  `<PageHeader title="Ayarlar" breadcrumb={[{ label: 'Sistem' }, { label: 'Ayarlar' }]} />`.
  `settings/page.tsx` keeps its explanatory paragraph as `description`.
- **`SettingsNav`.** It becomes an underline tab bar.
  - The `nav` gets `aria-label="Ayarlar bölümleri"`.
  - The active link gets `aria-current="page"` and
    `border-b-2 border-(--color-accent) text-(--color-text) font-semibold`.
  - Inactive links get `border-b-2 border-transparent text-(--color-muted) hover:text-(--color-text)`.
  - The tab list and its filtering logic are unchanged.
- **The settings clients** follow the form pattern.
  - Every `Section` gets `card`.
  - The field groups sit in `max-w-[720px]`. A table inside a section, such as the fee bands,
    may use the full width.
- **Individual sites:**
  - fees:107 "Sil" becomes a destructive ghost button.
  - fees:116 "+ bant ekle" (keep the exact text) becomes a ghost button.
  - marketplaces:144 is a comment; reword it.
  - marketplaces:207 is exempt as an inline action within a sentence.
  - product-sources:122 becomes a `Select`.
  - users:229 "Parolayı sıfırla" becomes `Button variant="secondary" size="sm"`.
  - users-client gets the Kullanıcılar breadcrumb.

- [ ] **Step 1: Remove the entries from `PENDING`, and write the tests**

`settings-nav.test.tsx`, using `mockNavigation('/settings/fees')`, with `stubFetch` answering
`/api/modules` with `{ modules: { seller: true, brand: true } }`:

- `active tab is marked`:
  - `getByRole('link', { name: 'Ücretler' })` has `aria-current="page"`;
  - `getByRole('link', { name: 'Pazaryerleri' })` has no `aria-current`.
- `hides seller tabs when the module is off`: with `seller: false`, after `waitFor`, there is no
  "Ücretler" link. This pins the existing behaviour.

`fees-client.test.tsx`, `keeps permission gating`: with the existing view-only permissions stub,
the save button is `disabled` and has `title={NO_PERMISSION_TITLE}`. If an existing test already
asserts this, reuse it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/kit-adoption.test.ts src/app/settings`

Expected:
- the guard FAILs on the 12 files;
- `active tab is marked` FAILs, because `aria-current` is missing.

- [ ] **Step 3: Convert the screens as listed above**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/kit-adoption.test.ts src/app/settings && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "Ayarlar: page header, underline tabs with aria-current, card form sections, kit controls".

---

### Task 3: İşler

**Files:**
- Modify: `jobs/page.tsx`, `jobs/jobs-client.tsx`, `jobs/jobs-client.test.tsx`
- Modify: `kit-adoption.test.ts`, removing `jobs/page.tsx` and `jobs/jobs-client.tsx` from
  `PENDING`

**Screen changes:**
- `page.tsx`: the `<h1>` becomes `PageHeader title="İşler"` with the Sistem breadcrumb.
- Every `Section` in `jobs-client.tsx` gets `card`.
- **Individual sites:**
  - :623 is a comment; reword "the `<select>`'s own fallback" to "the dropdown's own fallback".
  - :868 is Worker'ı Yeniden Başlat.
    - It becomes `Button size="sm"` with `variant={pendingRestartCount > 0 ? 'primary' : 'secondary'}`.
    - The label already carries "(N bekleyen)", so the word stays with the tone.
  - :942, :1224, :1244 and :1266 become `TextInput type="number"`, keeping `w-16` or `w-20`.
  - :953 "Kaydet" becomes `Button size="sm"` (primary).
  - :962 "Sıfırla" (keep the exact text) becomes `Button variant="ghost" size="sm"`.
  - :1022 is exempt: the status chip is the toggle.
  - :1047 (marketplace per row), :1331 and :1343 (history filters) become `Select`.
  - :1061 "Şimdi çalıştır" becomes `Button variant="secondary" size="sm"`. Copy the `disabled`
    expression and its comment verbatim.
  - :1081 (details), :1143 (reset circuit), :1292 (save rate) and :1319 become
    `Button variant="secondary" size="sm"`.
  - :1110 (show module-disabled jobs) becomes a ghost button.

- [ ] **Step 1: Remove the entries from `PENDING`, and add the tests to `jobs-client.test.tsx`**

- `run now stays disabled while queued`: in a fixture where a job's latest run is `queued`, the
  "Şimdi çalıştır" button in that job's row is `disabled`. If an existing test already pins this,
  name it in the ledger instead of duplicating it.
- `keeps permission gating`: with view-only permissions, "Şimdi çalıştır" is `disabled` and
  carries `NO_PERMISSION_TITLE`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/kit-adoption.test.ts src/app/jobs`

Expected: the guard FAILs and lists 18 sites in jobs-client and 1 `<h1` in page.tsx.

- [ ] **Step 3: Convert**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/kit-adoption.test.ts src/app/jobs && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "İşler: page header, card sections, kit controls".

---

### Task 4: Olaylar (list pattern)

**Files:**
- Modify: `events/events-client.tsx`, `events/events-client.test.tsx`
- Modify: `kit-adoption.test.ts`, removing `events/events-client.tsx` from `PENDING`

**Screen changes:**
- Add the Sistem breadcrumb to the `PageHeader`.
- The filter bar becomes a card: `flex flex-wrap items-end gap-3` with the panel class.
- **Individual sites:**
  - :172 (minimum level) and :186 (marketplace) become `Select`.
  - :198 (code) becomes `TextInput`.
  - :207 (listing lookup) becomes `TextInput icon={Search}`.
  - :220 is exempt as a combobox option.
  - :237 and :246 become `TextInput type="datetime-local"`.
  - :270 (CSV) becomes the export button.
- Both `Section`s get `card`.

- [ ] **Step 1: Remove the entry from `PENDING`, and add the test**

`filter bar wraps`: the element that contains the "Seviye" control (find the visible label in
the file) has `flex-wrap` in its class.

- [ ] **Step 2: Run the tests to verify they fail.** Run `npx vitest run src/app/kit-adoption.test.ts src/app/events`. Expected: the guard FAILs with 8 sites, and `filter bar wraps` FAILs.

- [ ] **Step 3: Convert**

- [ ] **Step 4: Run the tests to verify they pass.** Same command, plus `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: "Olaylar: breadcrumb, wrapping filter card, kit controls".

---

### Task 5: Satış · Stok

**Files:**
- Modify: `stock/stock-client.tsx`, `stock/stock-client.test.tsx`
- Modify: `kit-adoption.test.ts`, removing `stock/stock-client.tsx` from `PENDING`

**Screen changes:**
- Add the Satış breadcrumb, "Stok".
- `Section`s get `card`.
- **Individual sites:**
  - :130 (price multiplier) becomes `TextInput type="number" step="0.01"`, keeping its
    `aria-label`.
  - :409 is exempt as an inline action within a sentence.
  - :444, :452, :528, :603, :790 and :825 drop the squeeze and use `size="sm"`.
    - :825 also drops `pb-1.5!`.
    - The "Kaydet" button next to :603 drops `px-3! py-1!` and uses `size="sm"`.
  - :535 is exempt: the data cell is the control.
  - :589 "Sil" becomes a destructive ghost button.

- [ ] **Step 1: Remove the entry from `PENDING`.** There is no new behaviour, so the guard is this task's failing test.
- [ ] **Step 2: Run** `npx vitest run src/app/kit-adoption.test.ts src/app/stock`. Expected: the guard FAILs with 10 sites.
- [ ] **Step 3: Convert**
- [ ] **Step 4: Run the tests to verify they pass.** Same command, plus `npx tsc --noEmit`. Expected: PASS, with the existing stock tests unchanged.
- [ ] **Step 5: Commit.** Message: "Satış Stok: breadcrumb, card sections, compact kit buttons".

---

### Task 6: Satış · İlanlar (list)

**Files:**
- Modify: `listings/listings-client.tsx`, `listings/listings-client.test.tsx`
- Modify: `kit-adoption.test.ts`, removing `listings/listings-client.tsx` from `PENDING`

**Screen changes:**
- Add the Satış breadcrumb, "İlanlar".
- **Individual sites:**
  - :178, the tri-state filter (herhangi / evet / hayır), becomes `SegmentedFilter`.
    - The values are `'any' | 'true' | 'false'`, with the same labels.
    - `label` is the filter's visible name.
    - The mapping to `undefined | boolean` is unchanged.
  - :227 is exempt: the data cell is the control.
  - :243 (new price) becomes `TextInput className="w-20"`.
  - :251 (confirm) becomes `Button size="sm"`.
  - :259 (cancel) becomes a ghost button.
  - :275 and :283, the confirm step's yes and no, become `Button size="sm"` (primary) and
    `variant="secondary"`.
  - :335 and :344 (min and max) become `TextInput`, keeping `onBlur`.
  - :761, the phase toggles, become `Button size="sm"` with
    `variant={on ? 'primary' : 'secondary'}` and `aria-pressed={on}`.
  - :801 drops the squeeze.
  - :813 (apply preset) becomes a secondary button.
  - :820 (delete preset, icon-only) becomes `Button variant="ghost" size="sm" icon={X}`, with
    `aria-label="Bu kaydı sil"`.
  - :830 becomes `TextInput className="ml-auto w-40"`.
  - :836 (save preset) becomes a secondary button.
  - :948 is exempt as a sort header.

- [ ] **Step 1: Remove the entry from `PENDING`, and add the tests**

- `phase toggles expose their state`: click the first phase toggle; it gets
  `aria-pressed="true"`.
- `keeps permission gating`: with view-only permissions, the price-edit confirm path is not
  reachable, or its button is `disabled` with `NO_PERMISSION_TITLE`. Assert whichever the screen
  does today.

- [ ] **Step 2: Run** `npx vitest run src/app/kit-adoption.test.ts src/app/listings/listings-client.test.tsx`. Expected: the guard FAILs with 16 sites, and `phase toggles…` FAILs.
- [ ] **Step 3: Convert**
- [ ] **Step 4: Run the tests to verify they pass.** Same command, plus `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Satış İlanlar: breadcrumb, pressed phase toggles, kit controls".

---

### Task 7: Detail screens (ilan, takip edilen ürün, rakip satıcı)

**Files:**
- Modify: `listings/[id]/listing-detail-client.tsx` and its test
- Modify: `tracked-products/[id]/tracked-product-detail-client.tsx` and its test
- Modify: `competitors/sellers/[marketplace]/[ref]/seller-detail-client.tsx` and its test
- Modify: `kit-adoption.test.ts`, removing these three files from `PENDING`

**Screen changes** (detail pattern, spec §6.1, pattern 3):
- **Each `<h1>` block** becomes a `PageHeader` with the detail breadcrumb.
  - The `<h1>` text is the title.
  - The muted identifier line becomes `description`.
  - A back link, if any, becomes the `action` with `buttonClass('secondary', 'sm')`.
- **Listing detail:**
  - :363 (new price) becomes `TextInput`.
  - :561 and :569 (min and max) become `TextInput className="w-24"`.
  - :575 (save bounds) becomes a secondary button.
  - :393 and :600 (CSV) become export buttons.
  - Panels become cards.
- **Tracked-product detail:**
  - :271 (CSV) becomes an export button.
  - :338 is exempt: the data cell is the control.
- **Seller detail:**
  - :389, the period, becomes a `SegmentedFilter` with the Phase 2 fix.
  - :440 (group) and :611 (watched brand) become `Select`.
  - :463 becomes `TextInput`.
  - :470 (create group) becomes `Button size="sm"`.
  - :525 and :658 (CSV) become export buttons.
- **StatCards.** Add these only where the screen already holds the number. Do not add a fetch.
  The seller detail has `detail.listings.length` and `detail.trackedProducts.length`, which give
  "Ortak ilan" and "Takip edilen ürün", in `grid-cols-2 lg:grid-cols-4`. The other two screens
  get none unless a count is already on screen.

- [ ] **Step 1: Remove the entries from `PENDING`, and add the tests**

- In `seller-detail-client.test.tsx`, `period filter keeps its selection`:
  - spy `Date.now` to advance 1000 ms on each call;
  - click "Son 7 gün";
  - expect it to have `aria-pressed="true"` after the refetch resolves.
- In each of the three tests, `breadcrumb links back`:
  `getByRole('navigation', { name: 'Konum' })` contains a link to the list href
  (`/listings`, `/tracked-products` or `/competitors/sellers`).

- [ ] **Step 2: Run** `npx vitest run src/app/kit-adoption.test.ts "src/app/listings/[id]" "src/app/tracked-products/[id]" src/app/competitors/sellers`. Expected: the guard FAILs, and the new tests FAIL.
- [ ] **Step 3: Convert**
- [ ] **Step 4: Run the tests to verify they pass.** Same command, plus `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Detail screens: breadcrumbed headers, card panels, kit controls, a period filter that keeps its selection".

---

### Task 8: Markalar, Rakip Geçmişi, Rakip Satıcılar (list pattern)

**Files:**
- Modify: `brands/brands-client.tsx`, `competitors/competitors-client.tsx`,
  `competitors/sellers/sellers-client.tsx`, and their tests
- Modify: `kit-adoption.test.ts`, removing these three files from `PENDING`

**Screen changes:**
- Add the Satış breadcrumbs.
- **Markalar:**
  - :64 (CSV) becomes an export button.
  - :84 becomes `TextInput icon={Search}`.
- **Rakip Geçmişi:**
  - The filter bar becomes a wrapping card.
  - :187 and :196 become `TextInput type="date"`.
  - :205 (marketplace: Tümü / Trendyol / Hepsiburada) becomes `SegmentedFilter label="Pazaryeri"`.
  - :217 and :225 become `TextInput className="w-32"`.
  - :233 becomes `TextInput icon={Search} className="w-56"`.
  - :247 is exempt as a combobox option.
  - :264 ("İlan Filtresini Kaldır") becomes a ghost button.
  - :293, :347, :400 and :520 become export buttons.
  - The report `h2` + button blocks become `Section … card` with the button as `action`.
- **Rakip Satıcılar:**
  - :208, the period, becomes a `SegmentedFilter` with the Phase 2 fix.
  - :220 (marketplace) becomes `SegmentedFilter label="Pazaryeri"`.
  - :305 (CSV) becomes an export button.

- [ ] **Step 1: Remove the entries from `PENDING`, and add the tests**

- In `sellers-client.test.tsx`, `period filter keeps its selection`. This is the same test as in
  Task 7.
- In `competitors-client.test.tsx`, `marketplace filter is pressed`: clicking "Trendyol" gives
  it `aria-pressed="true"`, and the next report request carries `marketplaceCode=trendyol`. Use
  the existing request assertions' style.

- [ ] **Step 2: Run** `npx vitest run src/app/kit-adoption.test.ts src/app/brands src/app/competitors`. Expected: the guard FAILs, and the new tests FAIL.
- [ ] **Step 3: Convert**
- [ ] **Step 4: Run the tests to verify they pass.** Same command, plus `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Markalar, Rakip Geçmişi, Rakip Satıcılar: breadcrumbs, segmented filters, kit controls".

---

### Task 9: Alarmlar

**Files:**
- Modify: `alerts/alerts-client.tsx`, `alerts/alerts-client.test.tsx`
- Modify: `kit-adoption.test.ts`, removing `alerts/alerts-client.tsx` from `PENDING`

**Screen changes:**
- Add the Satış breadcrumb, "Alarmlar".
- The rule form follows the form pattern. Each `<label><span>…</span><control></label>` pair
  becomes `Field label="…"` around the kit control, inside `max-w-[720px]`.
- **Individual sites:**
  - :212 (product search) becomes `TextInput icon={Search}`.
  - :223 is exempt as a combobox option.
  - :288 (name) becomes `TextInput`.
  - :298 (quiet period, a number) becomes `Select` with string values, and `onChange` sets
    `Number(e.target.value)`.
  - :317, :337, :385, :401, :423, :451 and :468 become `Select`. Placeholder options keep their
    text.
  - :352 becomes `TextInput`.
  - :365 (clear scope) becomes a ghost button.
  - :482 (threshold) becomes `TextInput`. Its conditional danger border stays, through
    `className` with the `!` modifier, for example `border-(--color-danger)!`. The modifier is
    needed because CSS source order would otherwise drop it.
  - :510 becomes `TextInput className="w-24"`.
  - :536 "Kaydet" becomes `Button size="md"`, keeping `disabled={saving || thresholdInvalid}`.
  - :544 (cancel) becomes `Button variant="secondary" size="md"`.
  - :747 (CSV) becomes an export button.
  - :885 (new rule) becomes `Button size="md"`.
  - :898 (show rules), :953 ("düzenle") and :963 (enable/disable link) become ghost buttons.

- [ ] **Step 1: Remove the entry from `PENDING`, and add the tests**

- `quiet period posts a number`:
  - open a new rule;
  - fill the minimum valid fields the existing create test uses;
  - choose the second "Sessizlik süresi" option;
  - save;
  - expect the POST body's `quietPeriodMs` to have `typeof === 'number'` and to equal that
    option's ms value.
- `keeps permission gating`: with view-only permissions, the new-rule button is `disabled` with
  `NO_PERMISSION_TITLE`, or absent. Assert today's behaviour.

- [ ] **Step 2: Run** `npx vitest run src/app/kit-adoption.test.ts src/app/alerts`. Expected: the guard FAILs with 22 sites. `quiet period…` should pass before the conversion. If it does, it is a pin, not a RED; ledger it as such.
- [ ] **Step 3: Convert**
- [ ] **Step 4: Run the tests to verify they pass.** Same command, plus `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Alarmlar: breadcrumb, form-pattern rule editor, kit controls".

---

### Task 10: Hesabım and Lisans

**Files:**
- Modify: `account/account-client.tsx`, `account/mfa-section.tsx`,
  `account/mfa-setup/mfa-setup-client.tsx`, `account/password/password-client.tsx`
- Modify: `license/license-client.tsx` and its test
- Create: `account/account-client.test.tsx`
- Modify: `kit-adoption.test.ts`, removing the four pending files from `PENDING`

**Screen changes:**
- **Hesabım:**
  - `Section`s get `card`.
  - :153 "Sonlandır" and :181 "Unut" become `Button variant="secondary" size="sm"`.
- **mfa-setup:** :92 (show the key) and :119 (sign out) become ghost buttons.
- **password:** :91 (back) becomes a ghost button.
- **Lisans:**
  - Add the Ayarlar breadcrumb, and keep the existing title.
  - :162 (save) becomes `Button size="md"`, keeping `disabled={busy || token.trim() === ''}`.

- [ ] **Step 1: Remove the entries from `PENDING`, and write `account-client.test.tsx`**

`stubFetch` answers the account endpoint the client calls, with one current and one other
session and one remembered device. Copy the shape from the route's types.

- `only other sessions can be ended`: exactly one "Sonlandır" button.
- `ending a session posts its id`: click it; expect a POST with
  `{ action: 'endSession', id: <other id> }`.

- [ ] **Step 2: Run** `npx vitest run src/app/kit-adoption.test.ts src/app/account src/app/license`. Expected: the guard FAILs. The new account tests may pass, since they are pins; ledger it if so.
- [ ] **Step 3: Convert**
- [ ] **Step 4: Run the tests to verify they pass.** Same command, plus `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Hesabım and Lisans: card sections and kit buttons".

---

### Task 11: Sign-in, MFA, bootstrap and setup

**Files:**
- Modify: `components/auth-card.tsx`
- Create: `components/auth-card.test.tsx`
- Modify: `login/mfa/mfa-challenge-client.tsx`
- Modify: `setup/setup-wizard.tsx` and `setup/setup-wizard.test.tsx`
- Modify: `setup/steps/step1-database.tsx`, `step4-fees.tsx`, `step6-product-source.tsx`
- Modify: `kit-adoption.test.ts`, removing the five setup and MFA entries from `PENDING`

**Screen changes:**
- **`AuthCard`.** The navy brand panel frames the card.
  - The page background is `bg-(--color-bg)`.
  - Above the card sits a brand row: a `size-9 rounded-lg bg-(--color-sidebar)` square holding
    `Icon icon={ShoppingBag}` in `text-(--color-sidebar-strong)`, then "BuyBoxApp" in
    `font-semibold`.
  - The card is `rounded-xl border bg-(--color-surface) p-6 shadow-(--shadow-card)`, keeping
    `max-w-sm`.
  - The `h1` keeps `title`.
  - The props are unchanged.
- **mfa-challenge:**
  - :113 is exempt as a radio group. Its look becomes pill-shaped:
    `rounded-full border px-3 h-8 text-sm`, with the selected one using accent fill.
  - :185 becomes a ghost button.
- **Setup wizard:**
  - The `<h1>` block becomes `PageHeader title="Kurulum Sihirbazı" description="Adım N / M — <label>"`.
  - The step pills:
    - the current step gets `aria-current="step"`;
    - a done step is prefixed with "✓ " so its state has a word-like mark;
    - the step panel becomes the card class.
- **Setup steps:**
  - step1:131 and step6:132 become `Select`.
  - step4:155 "Sil" becomes a destructive ghost button.
  - step4:165 (add a band) becomes a ghost button.

- [ ] **Step 1: Remove the entries from `PENDING`, and write the tests**

`auth-card.test.tsx`:
- `renders the title as the page heading`:
  `getByRole('heading', { level: 1, name: 'Giriş yap' })`.
- `brand mark is decorative`: the brand icon has `aria-hidden="true"`.

`setup-wizard.test.tsx`:
- `current step is announced`: on first render, exactly one `li` has `aria-current="step"`, and
  its text is the first step's label.
- `done steps carry a mark`: after advancing one step, as the existing tests do, the first
  step's `li` text starts with "✓".

- [ ] **Step 2: Run** `npx vitest run src/app/kit-adoption.test.ts src/components/auth-card.test.tsx src/app/setup`. Expected: the guard FAILs, and the step tests FAIL.
- [ ] **Step 3: Convert**
- [ ] **Step 4: Run the tests to verify they pass.** Same command, plus `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Sign-in and setup: branded auth card, announced setup steps, kit controls".

---

### Task 12: Shell, Panel headings, and closing the guard

**Files:**
- Modify: `nav-shell.tsx` and `nav-shell.test.tsx`
- Modify: `dashboard-client.tsx`
- Modify: `kit-adoption.test.ts`
- Modify: `docs/superpowers/specs/2026-11-03-ui-redesign-design.md`

**Changes:**
- **nav-shell:**
  - :185, the header's "Sistem durumu alınamadı — Tekrar dene", becomes
    `Button variant="danger" size="md"`, keeping `title` and `onClick`.
  - :270 is exempt as an inline action within a sentence.
  - :385 and :500 are exempt as sidebar ink.
- **dashboard-client:**
  - :1144 is exempt as an error headline inside the danger box.
  - :1159, the loading state, becomes `PageHeader title="Panel"` followed by the existing
    `aria-live` paragraph.
- **kit-adoption.test.ts:**
  - Delete `PENDING` and the `pending files…` test.
  - Rename the describe block to "every screen under app/ uses the kit".
  - Update the doc comment: the guard covers all of `app/` (spec §7, Phase 3).
- **The spec:** mark §6.2 Phase 3 "Built 2026-11-03", naming this plan and the guard.

- [ ] **Step 1: Remove the last two entries from `PENDING`, and add the test**

In `nav-shell.test.tsx`, `status error offers retry`: stub the endpoint that the header's
system-status poll reads to fail. Find it in the poll that renders :185. Then
`getByRole('button', { name: /Sistem durumu alınamadı/ })` exists, and clicking it refetches.
If an existing test covers this, name it in the ledger.

- [ ] **Step 2: Run** `npx vitest run src/app/kit-adoption.test.ts src/app/nav-shell.test.tsx src/app/dashboard-client.test.tsx`. Expected: the guard FAILs on nav-shell (4 sites) and dashboard-client (2 `<h1`).
- [ ] **Step 3: Convert, delete `PENDING`, update the spec**
- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run && npx tsc --noEmit`

Expected: every file passes, with 0 type errors. The guard walks every `.tsx` under `app/`.

- [ ] **Step 5: Commit.** Message: "Close the kit guard over all of app/ and mark redesign phase 3 built".
