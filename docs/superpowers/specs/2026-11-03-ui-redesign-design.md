# Visual redesign of the web app — design

Status: **design and written spec approved by the product owner 2026-11-03.** Nothing is built.

Mockups: the Design canvas "BuyBoxApp yeni tasarım yönleri"
(https://claude.ai/artifact/H25QR8AD8FvX1NBaT9YnvK). The relevant boards are **A · Panel**,
**A · Kurumsal & kimlikli** (Takip Edilen Ürünler), and **2 · Lacivert** in its light and dark
forms. The other directions (B, C) and palettes (Petrol, Mürdüm, Grafit) were considered and
rejected.

## 1. Intent

The product owner does not like how the app looks and asked for a redesign from end to end. This
is a **visual** redesign. `docs/15-ui-redesign-plan.md` was an information-architecture pass and
explicitly not a visual refresh; this document is the visual refresh. It builds on doc 15 and
does not replace it. Every doc 15 rule still holds except where §2 below names an exception.

### Why the current UI looks generic (measured 2026-11-03)

- The palette is default Tailwind slate with blue `#2563eb`.
- The font is `system-ui`, and almost everything is set in `text-sm`, so the type scale is flat.
- Surfaces are separated by borders only. There is no elevation; `rounded border` occurs 310 times.
- There are no icons. The whole app contains one `<svg>`.
- The header holds only right-aligned controls.
- The kit is thin and only half adopted: 115 hand-rolled `<button>` against 86 kit `<Button>`, and
  75 raw `<input>` against 77 `<TextInput>`, across 44 screens and about 22k lines of TSX.

One thing works in our favour: no screen uses a raw palette class. Every colour goes through a
`--color-*` token, so a change of token values reaches every screen at once.

### Chosen direction

The chosen direction is **A · Kurumsal & kimlikli**, in the **Lacivert** palette:

- IBM Plex Sans for text, and IBM Plex Mono for numbers and money;
- a dark navy sidebar with an icon on every item;
- breadcrumb page headers;
- KPI cards;
- a segmented status filter with counts;
- pill status chips;
- tables set inside cards.

The product owner chose Lacivert because a blue accent is the clearest separation from the
red/amber/green status colours that carry meaning in this app.

### Success criteria

1. Every screen renders in the Lacivert light and dark themes, and the neon dark theme is gone.
2. Every colour-pair rule in `globals.css` (§3.4) holds, and a test enforces it.
3. After phase 3, no screen under `apps/web/src/app/` hand-rolls a `<button>` or an `<input>` that
   the kit covers, and a test enforces it.
4. No API route, job, business rule or money calculation changes. The diff touches presentation
   only.
5. All behaviour of the shell and kit that tests cover today still passes unchanged.

## 2. Decisions and doc exceptions

| Decision | Detail |
|---|---|
| Palette | Lacivert, light and dark (§3). |
| Dark theme | The Lacivert dark theme **replaces** the 2026-08-18 "Yüksek Kontrastlı Veri Paneli" (doc 06 §11). The product owner decided this on 2026-11-03. |
| Fonts | IBM Plex Sans and IBM Plex Mono, loaded through `next/font/google`. The font files are downloaded at build time and served by the app itself, so the browser never contacts Google at runtime. This matters on the customer's NAT'd server. No npm package is added. |
| Icons | `lucide-react` is added as a dependency. Only the icons that are imported get bundled. |
| Rollout | Foundation first, then the brand screens, then the rest (§6). |

**Exception to doc 15 §2 rule 9 ("No new dependency").** The product owner authorised this
exception on 2026-11-03, and it covers two things only: `lucide-react`, and the use of
`next/font/google` for IBM Plex. There is still no component library and no date library. When
this work is built, the exception is recorded in doc 15 rule 9 and in
`docs/08-configuration-and-constants.md`.

## 3. Tokens (`apps/web/src/app/globals.css`)

### 3.1 Principle

The existing token names stay, and only their values change. That is how the 44 screens pick up
the new palette without being touched. New tokens are added where direction A needs something
that has no token today. The neon dark blocks (the media query and `[data-theme='dark']`) are
replaced. The selection mechanism stays exactly as it is: the inline script in `layout.tsx`,
`data-theme`, and the system preference.

### 3.2 Changed values

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#F4F6F9` | `#0B1220` |
| `--color-surface` | `#FFFFFF` | `#111A2E` |
| `--color-border` | `#DFE4EC` | `#22304D` |
| `--color-text` | `#111B2E` | `#E6ECF5` |
| `--color-muted` | `#56627A` | `#93A0B8` |
| `--color-hover` | `#EDF0F5` | `#18233B` |
| `--color-chip-bg` | `#EEF1F6` | `#18233B` |
| `--color-chip-text` | `#3A465E` | `#C3CDE0` |
| `--color-strong-bg` / `-ink` | `#14213D` / `#FFFFFF` | `#1C2F5C` / `#FFFFFF` |
| `--color-accent` / `-ink` | `#2B59C3` / `#FFFFFF` | `#3366D6` / `#FFFFFF` |
| `--color-accent-bg` / `-border` | `#E4ECFB` / `#A9C0EE` | `rgba(51,102,214,.18)` / `rgba(91,141,239,.45)` |
| `--color-danger` / `-ink` | `#B42318` / `#FFFFFF` | `#F97066` / `#1A0504` |
| `--color-danger-bg` / `-border` | `#FEF3F2` / `#F3C3BE` | `#3A1714` / `#6E2620` |
| `--color-warning` / `-ink` | `#9A5B00` / `#FFFFFF` | `#F5B544` / `#1A1102` |
| `--color-warning-bg` / `-border` | `#FFF6E5` / `#F2D49B` | `#33240A` / `#6B4A12` |
| `--color-success` / `-ink` | `#1E7A46` / `#FFFFFF` | `#47CD89` / `#021A0E` |
| `--color-success-bg` / `-border` | `#EAF6EE` / `#B7E0C4` | `#0F2E1F` / `#1D5A3A` |

### 3.3 New tokens

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--color-sidebar` | `#14213D` | `#070D1A` | Sidebar ground. The sidebar is dark in both themes. |
| `--color-sidebar-text` | `#CBD3E3` | `#C3CDE0` | Sidebar item text. |
| `--color-sidebar-muted` | `#8C9BB8` | `#7F8CA8` | Group titles and the module name. |
| `--color-sidebar-active-bg` / `-text` | `#E4ECFB` / `#14213D` | `#1C2F5C` / `#FFFFFF` | Active item pill. |
| `--color-link` | = accent | `#8FB0F5` | Text links. On the dark ground the accent fails as text colour. |
| `--color-thead` | `#F8FAFC` | `#0F182B` | Table header row. |
| `--color-line` | `#EDF0F5` | `#1A2540` | Row dividers inside a card. |
| `--color-chart` | `#C9D8F5` | `#2B4A8A` | Chart and sparkline fill. |
| `--color-warning-strong` | `#7A4800` | `#F7C66B` | Headline text on a warning tint, e.g. the verdict banner. |
| `--shadow-card` | `0 1px 2px rgba(17,27,46,.05)` | `none` | Card elevation. The dark theme uses borders only. |
| `--font-sans` / `--font-mono` | IBM Plex Sans / Mono | same | Bound to the `next/font` CSS variables. |

`.tabular-figures` switches to `var(--font-mono)`.

### 3.4 Contrast rule

The rule already written in `globals.css` is kept and is now enforced by a test:

- Every status hue clears **4.5:1** on `--color-bg`, on `--color-surface`, and on its own `-bg`
  tint.
- Every `-ink` clears **4.5:1** on its solid fill.
- `--color-muted` and `--color-link` clear **4.5:1** on `--color-bg` and on `--color-surface`.
- `--color-sidebar-text` clears **4.5:1** on `--color-sidebar`.

Hand calculation suggests every value in §3.2 and §3.3 passes. For example, light warning is about
5.0:1 on `--color-bg` and dark muted is about 7:1 on `--color-bg`. The test is what decides. If a
value fails, it is adjusted until it passes, and the change is noted in this document.

## 4. Component kit (`apps/web/src/components/ui.tsx`, `table.tsx`)

### 4.1 Principle

The kit is extended, not rewritten. Every existing prop keeps its meaning, and everything new is
an optional prop, so the existing kit call sites restyle themselves without being touched.

### 4.2 Changes to existing components

- **Button**
  - `variant` grows from `primary | secondary` to `primary | secondary | danger | ghost`.
  - New `size: 'sm' | 'md'`, default `md`.
  - New `icon` prop, rendered before the label.
  - An icon-only button requires `aria-label`, enforced by the prop type.
- **Chip**
  - Becomes a pill (`rounded-full`).
  - New optional `dot` that shows a status dot.
  - The word stays mandatory (doc 15 rule 8).
- **Section**
  - Becomes a card: surface background, `--shadow-card`, 12px radius.
  - New optional `action` slot at the right end of the title row.
- **PageHeader** gains three optional parts:
  - a `breadcrumb` above the title;
  - `actions` on the right;
  - a one-line `description` under the title.
- **TextInput / Select / Field**
  - The control is 36px high.
  - Focus shows an accent ring.
  - TextInput gains an optional leading `icon`.
- **EmptyState / ErrorState / LoadingState**
  - Each gets a leading icon. Their copy does not change.
  - The skeleton rows use the new surface tokens.

### 4.3 New components

| Component | What it is |
|---|---|
| `StatCard` | Label, large Plex Mono value, optional delta line (e.g. "↑ 6 · geçen hafta 8"), optional `tone` that colours the value. |
| `SegmentedFilter` | A group of options, each with a count ("Tümü 128 · Tavsiye altı 14 · …"). It is a `role="group"` of buttons carrying `aria-pressed`, and it can be used from the keyboard. A tone may colour an option's label; the label text is always present. |
| `Icon` | The single place where lucide is imported. It fixes the default size and stroke, and it makes the set of icons in use visible in one file. |
| `VerdictBanner` | The dashboard's top band ("Sistem ilerliyor, 2 konu ilginizi bekliyor"). Its tone comes from the existing verdict. |

### 4.4 Table (`table.tsx`)

Behaviour does not change: column preferences, resizing, paging, filter presets and the sticky
header all stay. Presentation changes as follows:

- the frame sits inside a card;
- header cells use `--color-thead`, in small uppercase muted text;
- rows are divided by `--color-line`, and the hovered row uses `--color-hover`;
- money and other numeric columns are right-aligned in `.tabular-figures`.

### 4.5 Out of scope

These are not built until a screen actually needs one:

- modal;
- toast;
- tooltip;
- dropdown menu.

## 5. Shell (`apps/web/src/app/nav-shell.tsx`)

### 5.1 Principle

The shell's behaviour does not change, and its layout and look do. These behaviours stay exactly
as they are:

- the polls and their error states (system pause, licence banner);
- the permission checks;
- the confirm on resuming the system pause;
- module hiding and the Satış/Marka/Tümü view switch;
- longest-prefix active matching;
- the standalone routes that render outside the shell.

### 5.2 Sidebar

- It is 240px wide on `--color-sidebar` in both themes.
- At the top are a logo mark, "BuyBoxApp", and the module name below it.
- Group titles are small, uppercase, in `--color-sidebar-muted`.
- Every item has a lucide icon, declared next to its `href` in `NAV_GROUPS`.
- The active item is a light pill, replacing today's solid accent block.
- The user block moves to the bottom of the sidebar. It holds the name, the role, the "Salt
  okunur" chip, the Hesabım link and Çıkış yap.
- **Below 1024px** the sidebar collapses to an icon rail:
  - each item keeps its label as both `aria-label` and `title`;
  - a toggle opens and closes the rail, and the choice is stored in `localStorage`, read after
    mount the same way the theme is;
  - there is no mobile drawer.

### 5.3 Header

- **Left:** a scan-freshness pill per marketplace, e.g. green "Trendyol 8 dk önce" or amber
  "Hepsiburada 3 sa gecikmeli".
  - Its data comes from `/api/dashboard`, which already carries it. No new route is added.
    - For the brand module, the time is the latest `brandAudit.brands[].lastSweptAt` per
      `marketplaceCode`.
    - For the seller module, it is `competitorAlerts.coverage[]`, using `lastOkAt` and `stale`.
  - The pill is read once per full page load. It is not polled.
  - `/api/dashboard` is the dashboard's full payload, so it is a heavy read to make on every page.
    Phase 1 measures how long it takes on the copy database. If it is noticeably slow, the pill is
    dropped from phase 1. A dedicated light route would then be a separate decision, because it
    is a new route.
  - If that read fails, the pill is omitted. The dashboard already reports the failure.
- **Right:**
  - the view switch, rebuilt on `SegmentedFilter`;
  - the theme toggle;
  - the system-pause control, rebuilt on the kit `Button`.
  - The pause control keeps its colour semantics: muted while paused, green while running.

### 5.4 Out of scope

- An open-findings count badge on the sidebar. It would add a query on every page.
- A Ctrl K command palette.

## 6. Screen patterns and phases

### 6.1 Patterns

Screens are not designed one by one. Each one follows one of these four patterns.

1. **List.** Examples: Takip Edilen Ürünler, Marka Satıcıları, Denetim Bulguları, Stok, İlanlar.
   From top to bottom:
   - a PageHeader;
   - optionally 3–4 `StatCard`s, built only from numbers the screen already has, with no new
     query;
   - a filter bar with search, `SegmentedFilter` and selects;
   - the table card and the pager.
2. **Dashboard.** A `VerdictBanner`, a `StatCard` row, two-column cards, and the event log. The
   content and section order of `dashboard-client.tsx` stay as they are.
3. **Detail.** A header card, summary `StatCard`s, then `Section` cards stacked with no tabs, and
   the price chart where one exists.
4. **Form / settings.** `Field`s grouped into `Section` cards in a single column at most 720px
   wide, with the save action at the end.

### 6.2 Phases

Each phase is one PR, and the app is consistent at the end of each one.

**Phase 1 · Foundation**

- tokens (§3);
- fonts and icons;
- kit changes and new components (§4);
- the shell (§5);
- the table look;
- docs:
  - rewrite doc 06 §11 for Lacivert;
  - record the dependency exception in doc 15 rule 9 and doc 08.

Every screen gets the new palette, fonts and shell as soon as this phase lands.

**Phase 2 · Brand screens**

Brand is the module in production (`takipsistemi`), so it goes first. The screens are, in order:

1. Panel (`/`)
2. Takip Edilen Ürünler
3. Denetim Bulguları
4. Marka Satıcıları
5. İzlenen Markalar
6. Satıcı Politikası
7. Pazaryeri Eşleşmesi
8. Marka Karşılaştırması
9. `/brand/products`
10. `/brand/listings`
11. brand import

**Phase 3 · The rest**

- the seller screens (Stok, İlanlar, Markalar, Rakip Geçmişi, Rakip Satıcılar, Alarmlar);
- İşler, Olaylar, Ayarlar;
- Hesabım;
- sign-in, MFA, bootstrap, setup;
- licence.

### 6.3 Per-screen rules

- A screen that is touched loses every hand-rolled `<button>` and `<input>` the kit covers.
- Turkish labels stay in `lib/labels.ts` (doc 15 rule 10).
- No API route, data flow or business logic changes. Money stays `bigint` up to the display
  boundary, as it does today.

## 7. Verification

- At the end of every phase, the web test suite and the typecheck pass.
- **Phase 1** adds three groups of tests:
  - the contrast test (§3.4);
  - kit tests:
    - `aria-pressed` on `SegmentedFilter`;
    - icon-only `Button` labelling;
    - every tone rendering its word;
    - `StatCard` delta and tone;
  - a shell test for the collapsed rail: the stored preference, and labels kept as `aria-label`.
- **Phase 3** adds a guard test. It fails if any file under `apps/web/src/app/` renders a raw
  `<button className=` or `<input className=` outside the kit.
- Screens are checked visually by running the app against a **copy** of the database with the
  price jobs disabled, never against `apps/web/data/app.db` itself. That file is a live install
  with real marketplace credentials.
