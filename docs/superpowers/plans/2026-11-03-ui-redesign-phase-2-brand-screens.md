# UI Redesign · Phase 2 (Brand Screens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every brand-module screen uses the Phase 1 kit end to end:
- no hand-rolled buttons, inputs or selects;
- card sections;
- breadcrumbed page headers;
- KPI cards where the screen already has the numbers;
- the segmented filter where the screen already has a one-of-many filter.

**Architecture:**
- **Pattern-driven conversion** (spec §6.1). Each screen is mapped to one of four patterns: list,
  dashboard, detail or form. The per-screen table below says which pattern applies and what
  changes on that screen.
- **A growing guard test.** `kit-adoption.test.ts` holds a list of converted files and fails if
  any of them hand-rolls a control the kit covers. Each task adds its own files to that list
  first, watches the guard fail, then converts the screen until it passes.
- **Existing behaviour is pinned.** The screen smoke tests already in the repo pin behaviour, and
  they must keep passing unchanged except where a label moves into a kit component.

**Tech Stack:** Next.js 16.3, React 19, Tailwind v4, Vitest with jsdom and Testing Library. This
phase adds no dependency.

**Spec:** `docs/superpowers/specs/2026-11-03-ui-redesign-design.md`, §6. Phase 1 (`docs/superpowers/plans/2026-11-03-ui-redesign-phase-1-foundation.md`) is merged.

## Global Constraints

- **Presentation only (spec §6.3).**
  - No API route, request parameter, data flow or business logic changes.
  - A filter or number that the server does not already provide is **out of scope**. One example
    is the mock's "Tavsiye altı / Sınırda / Uyumlu" status filter on Takip Edilen Ürünler.
  - Money stays `bigint` up to the display boundary.
- **Colour.** Colour comes from tokens only, and a tone always comes with its word (doc 15 rules 7
  and 8).
- **Labels.**
  - Turkish labels stay where they are.
  - A label that is moved keeps its exact wording, because the tests assert on it.
  - A new label goes in `lib/labels.ts` only if it is an enum translation (doc 15 rule 10).
- **Kit API.** Use the Phase 1 kit in `components/ui.tsx` and `components/icon.tsx` as it is. Its
  only addition in this phase is `buttonClass` (Task 1).
- **Icons.** Import icons only through `components/icon.tsx`. Add re-exports there as needed.
- **No live database.** Never run anything against `apps/web/data/app.db`.
- **Running tests.** From `apps/web/`: `npx vitest run <path>`, the full suite `npx vitest run`,
  and `npx tsc --noEmit`.

## Review Focus

1. **Behaviour.** A converted control must keep its exact behaviour: `disabled`, `title`, `type`,
   `onClick` and its permission gating.
   - The commonest regression is a `ConfirmButton` or a permission-gated button losing
     `disabled={!can(...)}` or its `NO_PERMISSION_TITLE` when its markup is rewritten.
   - Pinned by `keeps permission gating` in each task whose screen has a gated action (Tasks 2, 4,
     5, 6, 7).
2. **Stale-refresh alerts.** These must stay visible and announced.
   - Screens show "Son yenileme başarısız oldu …" when a refresh fails over an existing list.
   - Restyling must keep `role="alert"`.
   - Pinned by the existing smoke tests' error cases, which must pass unchanged.
3. **Empty, error and loading states.** These must still render through `EmptyState`,
   `ErrorState` and `LoadingState` with unchanged copy. Pinned by the existing smoke tests.
4. **Narrow viewport.**
   - A `StatCard` row must wrap: use `grid-cols-2 lg:grid-cols-4`, never a fixed four columns.
   - A filter bar must wrap: use `flex-wrap`.
   - Pinned by the class assertion `stat row wraps` in Task 2 and Task 3.
5. **Colour-only state introduced by the restyle.**
   - Any `Chip` or `StatCard` tone added in this phase needs a visible word next to it.
   - Pinned by each task's `tone carries a word` assertion where the task adds a toned element.

---

## Shared conversion rules (apply in every screen task)

| Old | New |
|---|---|
| `<button className="rounded border …">` | `<Button variant="secondary" size="sm">`. Use `size="md"` only for a screen's primary action. |
| Text-only or `×` buttons inside rows | `<Button variant="ghost" size="sm" icon={…} aria-label="…">`. Keep the old `title` text as the `aria-label` when there was no visible text. |
| Destructive actions ("Sil", "Kaldır") | `variant="danger"` when it is the confirming action; `ghost` with `Trash2` when it is a row icon. |
| `<a className="rounded border …">` styled as a button | `<a className={buttonClass('secondary', 'sm')}>` (Task 1). A link stays a link. |
| `<input className=…>` (text, number or search) | `<TextInput>`. A search box gets `icon={Search}`. |
| `<select>` | `<Select options={…}>`. |
| A two-or-three-option `<Select>` that picks one state (e.g. Durum: Tümü / Aktif / Duraklatıldı) | `<SegmentedFilter label="<old Field label>" options={…}>`, with the same values and labels. |
| `<h1 className=…>` | `<PageHeader title=… breadcrumb={[{ label: 'Marka Denetimi' }, { label: title }]}>` |
| Existing `PageHeader` on a brand screen | Add the same `breadcrumb`. The Panel (`/`) gets none. |
| `<Section …>` | `<Section … card>`. A `TableFrame` placed directly inside a carded section keeps its card and stays as it is. |
| A bordered `<div className="rounded border …">` used as a panel | `<Section id=… title=… card>` when it has a heading; otherwise `rounded-xl border bg-(--color-surface) shadow-(--shadow-card) p-4`. |
| `className="px-2! py-1! text-xs"` on a `Button` | Delete it and use `size="sm"`. This fixes Phase 1's deferred minor "compact buttons grew". |

**Allowed exceptions.** These stay raw:
- a checkbox, radio, file or hidden `<input>`;
- a control the kit has no equivalent for, such as a sortable `<th>` button or a favourite star
  toggle.

Mark each such control with `{/* kit-exempt: <reason> */}` on the line immediately above it.

---

### Task 1: Kit adoption guard and `buttonClass`

**Files:**
- Create: `apps/web/src/app/kit-adoption.test.ts`
- Modify: `apps/web/src/components/ui.tsx`, to export `buttonClass`
- Modify: `apps/web/src/components/ui.test.tsx`

**Interfaces:**
- Produces:
  - `buttonClass(variant?: ButtonVariant, size?: 'sm' | 'md'): string`. This is the exact class
    string `Button` uses, minus the icon-only square rule. `Button` is refactored to call it.
  - `CONVERTED: readonly string[]` in `kit-adoption.test.ts`. These are paths relative to
    `apps/web/src/app/`, and each later task appends to the list.

- [ ] **Step 1: Write the failing tests**

`ui.test.tsx`:

- `buttonClass matches Button`:
  - render `<Button variant="danger" size="sm">X</Button>`;
  - expect its `className` to contain every space-separated token of
    `buttonClass('danger', 'sm')`.

`kit-adoption.test.ts`, with `// @vitest-environment node`, reading files the way
`client-imports.test.ts` does:

- `violations(source: string): string[]` is a helper defined in the test file. It finds every
  `<button`, `<input` and `<select` tag, and every `px-2! py-1!`, and returns one message per hit
  **unless**:
  - the hit is an `<input` whose tag text (up to the next `>` not preceded by `=`) contains
    `type="checkbox"`, `type="radio"`, `type="file"` or `type="hidden"`; or
  - one of the two lines above the hit contains `kit-exempt:`.
- `violations detects`: a table test of the helper itself.

| Source | Expected violations |
|---|---|
| `<button className="x">` | 1 |
| `{/* kit-exempt: sort */}\n<button>` | 0 |
| `<input type="checkbox" />` | 0 |
| `<input value={v} onChange={(e) => s(e)} />` | 1 |
| `<select>` | 1 |
| `className="px-2! py-1! text-xs"` | 1 |

- `converted brand screens use the kit`: for each file in `CONVERTED`,
  `expect(violations(source)).toEqual([])`.
  - `CONVERTED` starts **empty**, so this test passes trivially in Task 1. Each later task makes
    it fail by appending its files.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ui.test.tsx src/app/kit-adoption.test.ts`

Expected:
- `buttonClass matches Button` FAILs, because `buttonClass` is not exported yet.
- `violations detects` FAILs until the helper is written. Write the helper in this test file in
  Step 3.

- [ ] **Step 3: Implement**

- Export `buttonClass` from `ui.tsx` and have `Button` use it.
- Write `violations` in the test file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ui.test.tsx src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "Add the kit-adoption guard and buttonClass for link-styled buttons".

---

### Task 2: Panel (`/`, dashboard pattern)

**Files:**
- Modify: `apps/web/src/app/dashboard-client.tsx`
- Modify: `apps/web/src/app/dashboard-client.test.tsx`
- Modify: `apps/web/src/app/kit-adoption.test.ts`, appending `'dashboard-client.tsx'`

**Screen changes:**

- **The local `VerdictBanner`** (`dashboard-client.tsx:368-435`). Replace its markup with the
  kit's `VerdictBanner`.
  - Pass `title={verdict.headline}`, `detail={verdict.detail}` and `tone={verdict.tone}`.
  - Put the existing button (line ~398) in `action` as a kit `Button`, with the same label and
    handler.
  - Keep `aria-live="polite"` behaviour. The kit's `role="status"` already implies it, so remove
    the wrapper's duplicate.
  - Rename the local function to `DashboardVerdict` so the two names do not shadow each other.
- **A `StatCard` row directly under the banner**, in `grid grid-cols-2 gap-3 lg:grid-cols-4`.
  - Build it only from fields the payload already has.
  - When `brandAudit` is present:
    - `Açık bulgu` = `brandAudit.openFindings.stated`, tone `danger` when > 0;
    - `Satıcısı olmayan ürün` = the sum of `brandAudit.brands[].noSellerCount`, tone `warn`
      when > 0;
    - `Tavsiye fiyat kapsamı` = `%` + round(100 × `productsWithPrice` / `productsTotal`), with
      the delta `productsWithPrice / productsTotal ürün`;
    - `Takip edilen ürün` = the sum of `brandAudit.brands[].productCount`.
  - When `brandAudit` is null (seller-only install), omit the row. The seller numbers stay in
    their sections.
- **Remove the duplicates.** The three tiles in `BrandAuditSection` (line ~890) that repeat
  "açık bulgu", "satıcısız" and "kapsam" are dropped from that section, because the stat row now
  carries them. The section keeps its per-brand table and trend.
- **Sections.** Every `<Section>` gets `card`. "Güvenlik Anahtarları" and "Pazaryerleri" keep
  their inner two-column grids.
- **Raw buttons.** Every raw `<button>` is converted (2 today).

- [ ] **Step 1: Append to `CONVERTED` and add the tests in `dashboard-client.test.tsx`**

- `stat row from brand audit`: render the existing brand-populated fixture. Then:
  - `getByText('Açık bulgu')` exists, and so does the matching number from the fixture's
    `openFindings.stated`;
  - the row's container class contains `grid-cols-2` and `lg:grid-cols-4` (this is `stat row
    wraps`).
- `tone carries a word`: each `StatCard` with a tone has its label text present. This is already
  implied by the previous test; assert one label for each of the danger and warn tones.
- `no stat row without brand audit`: with the seller-only fixture, `queryByText('Açık bulgu')`
  is null.
- `keeps permission gating`: with the existing view-only fixture/permissions stub, the
  price-submission switch is still `disabled` and carries `NO_PERMISSION_TITLE`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/dashboard-client.test.tsx src/app/kit-adoption.test.ts`

Expected:
- the guard FAILs and lists 2 raw buttons;
- the stat-row tests FAIL.

- [ ] **Step 3: Convert the screen as listed above**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/dashboard-client.test.tsx src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS, with every pre-existing dashboard test unchanged.

- [ ] **Step 5: Commit**

Message: "Panel: kit verdict banner, KPI row from the brand audit, card sections".

---

### Task 3: Takip Edilen Ürünler (list pattern)

**Files:**
- Modify: `apps/web/src/app/tracked-products/tracked-products-client.tsx`
- Modify: `apps/web/src/app/tracked-products/tracked-products-client.test.tsx`
- Modify: `apps/web/src/app/kit-adoption.test.ts`, appending
  `'tracked-products/tracked-products-client.tsx'`

**Screen changes:**

- **`PageHeader`.**
  - Add `breadcrumb`.
  - "Excel'e Aktar" uses `buttonClass('secondary', 'sm')` with a `Download` icon before its text.
- **A `StatCard` row** under the header, in `grid-cols-2 lg:grid-cols-4`. Use only numbers the
  screen already holds:
  - `Ürün` = the paged response's total count (the same number the pager shows);
  - `Marka` = `brands.length`;
  - `Kategori` = `categories.length`.
  - Only three cards: there is no fourth number without a new query.
- **The filter panel** (`line ~735`) becomes a card div.
  - The `Durum` Select becomes `<SegmentedFilter label="Durum">` with
    `Tümü '' / Aktif 'true' / Duraklatıldı 'false'`.
  - "Ara" gets `icon={Search}`.
  - "Temizle" uses `size="sm"`.
- **Saved-filter row** (`line ~833`):
  - preset buttons become `Button variant="secondary" size="sm"`;
  - `×` becomes `Button variant="ghost" size="sm" icon={X} aria-label="Bu kaydı sil"`;
  - the name input becomes `TextInput`;
  - the save button becomes `Button size="sm"`.
- **Rows.**
  - The favourite star toggle (`aria-pressed` at line ~536) stays raw, marked
    `kit-exempt: favourite toggle`.
  - The other row buttons follow the shared rules.
- **Stale-refresh alert** (`line ~725`). Keep `role="alert"`; restyle it to `rounded-lg`.

- [ ] **Step 1: Append to `CONVERTED` and add the tests**

- `stat row`: with the populated fixture, `getByText('Ürün')` is inside an element whose class
  contains `grid-cols-2` (this is `stat row wraps`).
- `status is a segmented filter`:
  - `getByRole('group', { name: 'Durum' })` exists;
  - clicking `Duraklatıldı` makes the next `fetch` URL contain `active=false`. Read it from the
    `fetch` mock's last call.
- `preset delete keeps its name`: with one stored preset, `getByRole('button', { name: 'Bu kaydı sil' })`
  exists. Install the in-memory storage used in `nav-shell.test.tsx` if the test needs a working
  `localStorage`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/tracked-products src/app/kit-adoption.test.ts`

Expected: the guard and the new tests FAIL.

- [ ] **Step 3: Convert the screen**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/tracked-products src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "Takip Edilen Ürünler: KPI row, segmented status filter, kit controls".

---

### Task 4: Denetim Bulguları (list pattern)

**Files:**
- Modify: `apps/web/src/app/watched-brands/findings/findings-client.tsx`
- Modify: its `.test.tsx`
- Modify: `kit-adoption.test.ts`, appending `'watched-brands/findings/findings-client.tsx'`

**Screen changes:**

- **All three `PageHeader` instances** (lines ~626, ~637, ~655) get the `breadcrumb`.
- **The "Özet" section** (line ~788): if it renders counts in bordered boxes, those become a
  `StatCard` row (`grid-cols-2 lg:grid-cols-4`). It keeps the same labels and numbers, with tone
  `danger` on a non-zero open count.
- **Kind toggles** (`aria-pressed` at line ~896) are a many-of-many filter, not one-of-many, so
  they stay toggle buttons. Rebuild them as `Button variant={hidden ? 'secondary' : 'primary'} size="sm" aria-pressed=…`.
- **"Eşikler"** (line ~722) and the remaining sections get `card`.
- **Inputs and selects.** The 1 raw input and 2 raw selects become kit controls.

- [ ] **Step 1: Append to `CONVERTED` and add the tests**

- `kind toggles stay pressed buttons`: the first kind button has `aria-pressed="true"`, and
  clicking it flips the value to `"false"`.
- `keeps permission gating`: on the existing view-only path, any acknowledge or resolve action
  stays `disabled`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/watched-brands/findings src/app/kit-adoption.test.ts`

Expected: the guard FAILs.

- [ ] **Step 3: Convert the screen**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/watched-brands/findings src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "Denetim Bulguları: card sections, KPI summary, kit controls".

---

### Task 5: Marka Satıcıları (list pattern), with its identity panel

**Files:**
- Modify: `apps/web/src/app/watched-brands/sellers/brand-sellers-client.tsx`
- Modify: `apps/web/src/app/watched-brands/sellers/seller-identity-panel.tsx`
- Modify: `brand-sellers-client.test.tsx`
- Modify: `kit-adoption.test.ts`, appending both paths

**Screen changes:**

- **Header.** The raw `<h1>Markalarımı Kimler Satıyor</h1>` (line ~315) becomes a `PageHeader`
  with the same title text and the breadcrumb `Marka Denetimi / Marka Satıcıları`.
  - The title text stays "Markalarımı Kimler Satıyor", because tests and operators know it.
  - Any paragraph directly under the old `h1` moves into `description`.
- **Controls.** The 3 raw selects become `Select`, and the 2 + 3 raw buttons follow the shared
  rules.
- **Sections.** "Satıcılar" gets `card`.
- **Identity panel.** Its outer box becomes a card div.

- [ ] **Step 1: Append to `CONVERTED` and add the tests**

- `title survives as h1`: `getByRole('heading', { level: 1, name: 'Markalarımı Kimler Satıyor' })`
  exists.
- `keeps permission gating`: the policy action is still `disabled`, with its existing title,
  when no brand is selected. The existing title text is "Politika markaya özeldir — kapsamdan
  bir marka seçin".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/watched-brands/sellers src/app/kit-adoption.test.ts`

Expected: the guard FAILs.

- [ ] **Step 3: Convert both files**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/watched-brands/sellers src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "Marka Satıcıları: page header, card sections, kit controls".

---

### Task 6: İzlenen Markalar (form + list)

**Files:**
- Modify: `apps/web/src/app/watched-brands/watched-brands-client.tsx`
- Modify: its `.test.tsx`
- Modify: `kit-adoption.test.ts`, appending `'watched-brands/watched-brands-client.tsx'`

**Screen changes:**
- `PageHeader` gets the `breadcrumb`.
- "Marka veya grup ekle", "Ölü ürün önerisi" and the list section get `card`.
- The 4 raw buttons follow the shared rules. A remove action becomes a `ghost` `Trash2` icon
  button whose `aria-label` is its old visible text.

- [ ] **Step 1: Append to `CONVERTED` and add the tests**

- `keeps permission gating`: the add form's submit is `disabled` for a view-only user, exactly as
  before. Copy the setup from the existing view-only test, or stub `/api/auth/me` with
  `permissions: ['view']` if none exists.

- [ ] **Step 2: Run the tests to verify they fail**

Expected: the guard FAILs.

- [ ] **Step 3: Convert the screen**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/watched-brands/watched-brands-client.test.tsx src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "İzlenen Markalar: card sections and kit controls".

---

### Task 7: Satıcı Politikası (form pattern)

**Files:**
- Modify: `apps/web/src/app/watched-brands/policy/policy-client.tsx`
- Modify: its `.test.tsx`
- Modify: `kit-adoption.test.ts`, appending `'watched-brands/policy/policy-client.tsx'`

**Screen changes:**

- **Header.** The `<h1>Satıcı Politikası</h1>` (line ~268) becomes a `PageHeader` with the
  breadcrumb.
- **Sections.** The three `<h2 id=…>` sections (manual add ~371, import ~452, sellers ~490)
  become `<Section id="<same id>" title="<same text>" card>`.
  - Keep each `id`, because `aria-labelledby` and the tests depend on it.
  - The form sections are capped at `max-w-[720px]` (spec §6.1 pattern 4). The sellers table
    section is not capped.
- **Controls.** The 7 raw inputs become `TextInput`, except file and checkbox inputs, which stay
  raw and need no mark. The 4 raw selects become `Select`.

- [ ] **Step 1: Append to `CONVERTED` and add the tests**

- `sections keep their ids`: `getByRole('region', { name: <manual-add heading text> })` exists.
  Do the same for the import and sellers headings.
- `keeps permission gating`: the manual-add submit is `disabled` for view-only.

- [ ] **Step 2: Run the tests to verify they fail**

Expected: the guard FAILs.

- [ ] **Step 3: Convert the screen**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/watched-brands/policy src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "Satıcı Politikası: page header, card form sections, kit controls".

---

### Task 8: Pazaryeri Eşleşmesi and Marka Karşılaştırması

**Files:**
- Modify: `apps/web/src/app/watched-brands/cross-marketplace/cross-marketplace-client.tsx`
- Modify: `apps/web/src/app/watched-brands/comparison/brand-comparison-client.tsx`
- Modify: both `.test.tsx` files
- Modify: `kit-adoption.test.ts`, appending both paths

**Screen changes:**

- **Both screens**:
  - `PageHeader` gets the `breadcrumb`;
  - sections get `card`.
- **Pazaryeri Eşleşmesi**:
  - the text filter input becomes `TextInput icon={Search}`;
  - "Barkod Kapsamı": if it shows counts, they become a `StatCard` row using the same numbers.
- **Marka Karşılaştırması**:
  - the "Dönem özeti" `<h2>` (line ~205) becomes a carded `Section` with id `comparison-summary`;
  - the period select becomes a `Select`. If it has three or fewer options, it becomes a
    `SegmentedFilter` with the same label;
  - the 3 raw buttons follow the shared rules.

- [ ] **Step 1: Append to `CONVERTED` and add one test per screen**

- `cross-marketplace search box`: `getByRole('textbox')` still filters the rows, as in the
  existing test.
- `comparison summary is a region`: `getByRole('region', { name: 'Dönem özeti' })` exists.

- [ ] **Step 2: Run the tests to verify they fail**

Expected: the guard FAILs, along with the comparison test.

- [ ] **Step 3: Convert both screens**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/watched-brands/cross-marketplace src/app/watched-brands/comparison src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "Pazaryeri Eşleşmesi and Marka Karşılaştırması: card sections and kit controls".

---

### Task 9: Marka Stok, import panel, product detail, Marka İlanlar

**Files:**
- Modify: `apps/web/src/app/brand/products/brand-products-client.tsx`
- Modify: `apps/web/src/app/brand/products/import-panel.tsx`
- Modify: `apps/web/src/app/brand/products/[id]/brand-product-detail-client.tsx`
- Modify: `apps/web/src/app/brand/listings/listings-client.tsx`
- Create: `apps/web/src/app/brand/products/brand-products-client.test.tsx`, because no smoke test
  exists. Shape it like `brand/listings/listings-client.test.tsx`.
- Modify: `kit-adoption.test.ts`, appending all four paths

**Screen changes:**
- **All four**:
  - `PageHeader` gets the breadcrumb `Marka Denetimi / Stok` or `Marka Denetimi / İlanlar`;
  - sections get `card`.
- **Product detail** follows the detail pattern (spec §6.1 pattern 3):
  - a header card;
  - summary numbers it already shows become `StatCard`s;
  - the price chart stays where it is.
- **Raw inputs.** The 1 raw input in each of `brand-products-client` and `import-panel` becomes a
  kit control. The import panel's input is probably a file input; if so, it stays raw.

- [ ] **Step 1: Write `brand-products-client.test.tsx` and append to `CONVERTED`**

The new file covers:
- `loading`: a pending fetch shows the loading message.
- `populated`: one product row renders by name.
- `error`: `ErrorState` shows `Tekrar dene`.

Read the route the screen fetches from its own code, and stub that route.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/brand src/app/kit-adoption.test.ts`

Expected: the guard FAILs. The new smoke tests may already pass: they pin existing behaviour
before the restyle, and that is intended.

- [ ] **Step 3: Convert the four files**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/brand src/app/kit-adoption.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: "Brand Stok, İlanlar and product detail: card sections, detail pattern, kit controls".

---

### Task 10: Phase verification

- [ ] **Step 1: Run the full suite, the typecheck and the build**

Run from `apps/web/`: `npx vitest run && npx tsc --noEmit && npm run build`

Expected: all three pass. Revert `next-env.d.ts` if the build rewrote it.

- [ ] **Step 2: Mark Phase 2 as built**

In spec §6.2, add one line under "Phase 2 · Brand screens":

> Built 2026-11-xx; screens guarded by `kit-adoption.test.ts`.

- [ ] **Step 3: Hand over the visual check**

The visual check is the user's: this session has no browser tool. List the 11 brand routes in
the final message, each to be checked in light and dark theme at 1280px and 900px.
