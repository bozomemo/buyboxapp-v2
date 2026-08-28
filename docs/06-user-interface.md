# 06 — User Interface (target specification)

Next.js 16 (App Router), TypeScript, Tailwind. Implementation home: `apps/web`.

The UI is the operator's entire control surface. Turkish labels are given verbatim where the
operator already knows the app by them; the interface language is Turkish.

---

## 1. Navigation

| Route | Screen | Purpose |
|-------|--------|---------|
| `/` | Dashboard | Health, budget, alerts, job status, what the bot is doing right now |
| `/stock` | Stock items | Physical products, costs, per-marketplace preferences |
| `/listings` | Listings | The main working grid, filterable by marketplace |
| `/listings/[id]` | Listing detail | Everything about one listing, including its decision history |
| `/brands` | Brands | Marka bazlı gezinme — click a brand, see its listings (§12.1) |
| `/competitors` | Competitor history | Time-series reporting over the retained scrape data |
| `/competitors/sellers` | Competitor sellers | The same archive by seller: overlap, pricing behaviour, identity linking |
| `/tracked-products` | Tracked products | Products we do not sell, watched for price/rank by link (§12.2) |
| `/alerts` | Alerts | Open competitor conditions and the rules that raise them |
| `/jobs` | Jobs | Run history, manual triggers, schedules |
| `/events` | Event log | Persisted, filterable operation log |
| `/settings/*` | Settings | Marketplaces, fees, policies, product sources, retention |
| `/setup` | Setup wizard | First run and re-configuration (doc 10 §6) |

---

## 2. Dashboard

The first thing the operator sees. Answers "is it working, and is it safe?"

- **Kill switches** — global and per marketplace, one click, immediate, with the current state
  unmistakable.
- **Update budget** per marketplace: consumed / allowance, remaining, reserve. A progress bar
  that turns amber below the reserve and red at exhaustion.
- **Phase distribution**: how many listings are in `SEEKING` / `CLIMBING` / `REFINING` /
  `OPTIMUM` / `BLOCKED`. A healthy system is overwhelmingly `OPTIMUM`.
- **Active alerts**, newest first, each linking to the affected listing.
- **Marketplace health**: reachable, circuit-breaker state, last successful import, last
  successful buybox observation, scrape failure rate.
- **Recent decisions**: the last N price changes with reason and explanation.

---

## 3. Stock items (`/stock`)

| Column | Field | Editable |
|--------|-------|----------|
| Stok Kodu | `baseStockCode` | no |
| Ürün İsmi | `name` | manual source only |
| Birim Fiyat | `unitCost` | manual source only |
| Stok Miktarı | `unitStock` | manual source only |
| TY Satış Stok | derived | no |
| HB Satış Stok | derived | no |
| TY Çarpan | `priceMultiplier` (TY) | **yes** |
| HB Çarpan | `priceMultiplier` (HB) | **yes** |
| TY Oto BB | `autoRepriceEnabled` (TY) | **yes** |
| HB Oto BB | `autoRepriceEnabled` (HB) | **yes** |
| Kaynak | `sourceCode` | no |

**Row highlighting** (semantics preserved from the legacy app):

| Condition | Effect |
|-----------|--------|
| Total offered across marketplaces > physical stock | stock cell amber — over-listed |
| `unitCost == 0` while anything is on sale | cost cell violet — missing cost |
| Offered stock 0 on a marketplace while physical stock > 0 | that cell highlighted — listing opportunity |
| Cost unknown / unresolvable | row red — excluded from automation |

**Actions:** add a stock item manually · import from the configured source (with a preview of
the first 20 rows before committing) · edit column mapping for the Excel source · open the
bundle editor.

**Bundle editor:** add and remove members with quantity. No five-member cap.

---

## 4. Listings (`/listings`)

The main working surface. One grid, filtered by marketplace, virtualised and server-paged —
the legacy app loaded the whole catalogue into memory.

### 4.1 Columns

| Group | Columns |
|-------|---------|
| Identity | Pazaryeri · Marketplace SKU · Stok Kodu · Ürün Adı |
| Cost | Orj. Birim Fiyat · Birim Fiyat · **Dip Fiyat** · Komisyon · KDV |
| Price | Satış Fiyatı · Müşteri Fiyatı · PSF · Marj % |
| Stock | Satış Stok · Fiziksel Stok |
| Competition | Sıra · Buybox Fiyatı · **Buybox Mağaza** · 2. Fiyat · 3. Fiyat · Fark |
| Engine | **Faz** · Optimum Fiyat · Son Karar · Son Gönderim Durumu |
| Controls | Oto BB · Fiyat Artır · Fiyat Düşür · Min Fiyat · Max Fiyat |
| Status | Satılabilir · Kilitli · Askıda · Kampanyalı |

**Competitor price, rating, name and dispatch time are separate typed columns.** The legacy
system packed them into strings like `"9.2 / SellerName"` and `"149.90 / 129.90"` and then
parsed them back to make decisions (doc 09 §12). This must not recur.

**Buybox Mağaza** (customer feedback 2026-08-25) is the store name of whoever currently holds
the buybox. It is sourced from `competitor_observations` — the scrape-sourced, reporting-only
archive (doc 05 §5) — never from `buybox_observations`, the API-sourced table the pricing path
reads. The two can disagree in staleness (a scrape can lag the last API poll) and the column is
allowed to show `—` when nothing has been scraped yet; it never blocks or delays a pricing
decision.

### 4.2 Row highlighting

| Condition | Effect |
|-----------|--------|
| `price < floorPrice` | red — selling at a loss |
| Locked / suspended | grey, struck through |
| `phase == BLOCKED` | amber — cannot compete profitably |
| `canWinBuybox` | green — floor is below the buybox price and we are not in it |
| `rank == 1` | rank cell green |
| `phase == OPTIMUM` | subtle, no emphasis — this is the healthy state |
| Cost unknown | red outline, automation disabled |

### 4.3 Editable cells

| Column | Effect |
|--------|--------|
| Satış Fiyatı | **Confirmation dialog**, then a manual submission through the normal outbox — pending / confirmed / failed shown inline |
| Satış Stok | Same |
| PSF | Same. Decimals preserved (the legacy truncated to integer, doc 09 §15) |
| Min Fiyat / Max Fiyat | Local; enforced by the engine on the next decision |
| Oto BB / Fiyat Artır / Fiyat Düşür | Local switches |

A manual price edit **pauses automation for that listing** for a configurable period so the bot
does not immediately overwrite the operator, and says so in the UI.

### 4.4 Filters

Built structurally, never by string concatenation (doc 09 §20). Server-side.

- Text: marketplace SKU, stock code, product name, brand, category. Brand is filterable today via
  `brandId` (cross-navigation from `/brands`, §12.1) — a free-text brand/category search box on
  this screen itself is not yet built.
- Numeric with operator: commission, VAT, offered stock, physical stock, margin %
- Multi-select: marketplace, phase, last decision reason
- Tri-state booleans (true / false / any): in buybox · can win buybox · selling at a loss ·
  locked · blacklisted · at list price · campaign active · automation enabled · observation
  enabled (independent of automation — doc 07 §2.2)
- Saved filter presets

### 4.5 Cross-navigation

Selecting a stock item filters the listing grid to that base stock code — the legacy
double-click/Enter behaviour, preserved.

### 4.6 Bulk actions

Applied to the current filtered selection, with a confirmation showing the affected count:
enable/disable automation · enable/disable observation (independent of automation — doc 07
§2.2) · set min/max price · set price multiplier · force re-optimisation (reset phase to
`SEEKING`) · exclude from automation.

---

## 5. Listing detail (`/listings/[id]`)

Four panels.

**Now** — identity, cost breakdown (unit cost → cargo → commission → VAT → floor, shown as a
waterfall so the operator can see exactly where the floor comes from), current price, margin,
stock, status flags, campaign window, product image, link to the marketplace page.

**Competition** — current ranked offers with name, price, customer price, rating, dispatch
time, stock where available; plus a price chart over time drawn from
`competitor_observations` (§6).

**Engine** — current phase, `lastGoodPrice`, `lastBadPrice`, `optimumPrice`, the invalidation
context snapshot, and **why the last decision was what it was**, in words. Buttons: force
re-optimisation, pause automation, set bounds.

**History** — every `price_submission` for this listing: decided at, old → new price, reason,
explanation, state, failure code and message if any, and the decision-time snapshot (cost,
floor, buybox price, rank, commission, VAT). This is what makes a price explainable months
later.

---

## 6. Competitor history (`/competitors`)

The reporting surface over the indefinitely-retained scrape data — the reason for storing it.

- **Price timeline** per listing: our price, buybox price, and each competitor's price over
  time, with our price-change events marked.
- **Seller presence**: which sellers appeared on a product and when; entries and exits.
- **Buybox share**: percentage of observed time each seller held the buybox, over a period.
- **Seller profile**: a given competitor across all our products — how often they appear, how
  aggressively they price, when they are active.
- **Observation coverage**: `scrape_runs` density, so the operator can see where data is thin.

Filters: date range, listing, stock code, marketplace, seller. Export to CSV/Excel.

**Buybox share is time-weighted when a single listing is selected**: each observation counts for
the interval until the next one, and stretches of no observation are excluded from the
denominator rather than attributed to the last-seen winner. Counting occurrences instead
over-weights busy periods — a product rescanned five times in an hour because prices were moving
would outweigh a quiet day that represents the same hour. Across many listings the figure stays
an occurrence count and says so on screen.

Every figure carries a **coverage badge**: attempts, successes, failure rate, average interval
and the last *successful* scrape. This is not decoration. The live archive ran at a 52% scrape
failure rate before Playwright landed, with one hour at 128 failures and zero successes; the
seller counts from that window are not wrong so much as describing far less than they appear to.
Freshness is measured from successful looks only — a job failing every hour is not fresh data —
and a window with no successful scrape at all says so loudly rather than rendering an empty
table that reads as "no competitors".

First/last-seen are **observation** dates, shown with `≥`. "Seen from 12 August" means "absent at
the 11 August 21:00 scrape, present at the 12 August 09:14 one", not "started selling then".

Language throughout is **"listed at"**, never "sold at". We observe offers, not sales.

### 6.1 Sellers (`/competitors/sellers`)

The same archive along its other axis. §6 above answers "who is on this product"; this answers
"which of our products is this seller on, since when, and how do they price against us".

- **Seller list**: overlap (how many of our listings), offers recorded, buybox count and rate,
  average rank, price range, first/last seen. Ordered by overlap descending — "who do we compete
  with most" is not a separate report, it is this list's default order.
- **Seller detail** (`/competitors/sellers/[marketplace]/[ref]`): every product of ours that
  seller competed on, our price beside their range, plus the identity controls below.
- **Cross-marketplace overlap**: products of ours listed on more than one marketplace with the
  same competitor on more than one of them. CSV export.

Two identities have to line up for that last report, and **only one is automatic**: the product
across marketplaces is our own `base_stock_code`, but the seller across marketplaces is an
operator-defined group (doc 05 §5). An ungrouped seller therefore never appears in it, however
many marketplaces it trades on. Sellers whose *names* coincide across marketplaces are offered
as suggestions to review and are never counted as matches.

Offers the marketplace did not attach a merchant id to belong to no seller here. They are
reported as a count beside the list rather than omitted, so the list is not read as exhaustive.

**Our own store is not a competitor.** We are one of the offers on our own listings, and the
archive records that on purpose — a rank means nothing without the offers it is a rank among.
But every seller-*centric* report has to take us back out again, or we top it on 100% of our own
listings by construction, which is arithmetic rather than information. Our own figures are shown
as a separate line beside the list ("on N products, held the buybox M times"), because removing
us from "who are we up against" is right and losing "how are we doing" is not.

Identity comes from `marketplaces.merchant_ref` — the same field the repricer's own-offer filter
uses (doc 03 §6.5) — and never from the store's display name. That makes a wrong or missing
merchant ref invisible: the exclusion silently removes nothing and the screen looks merely
wrong. So the screen checks its own premise. We necessarily appear on our own listings, so if
the configured ref never appears in that marketplace's offers, the value is not the id the
marketplace publishes, and the screen says so and links to the setting instead of quietly
presenting us as our own biggest rival. A marketplace with no successful scrapes in the window
is reported as unobserved, not misconfigured.

The listing-centric **Buybox Payı** report (§6) still includes us, and should: on a single
listing "who holds the buybox, and for how long" is a question our own share is part of the
answer to.

Every figure on these screens is aggregated in SQL rather than fetched and totalled in the API
route. A seller-centric question spans every listing the seller appears on and has no natural
bound: at the 2,000-listing target one seller's 30-day profile is ~29,000 offer rows against a
20,000-row fetch cap, so counting in the route would answer confidently from part of the window.

### 6.2 Alerts (`/alerts`)

Competitor alerts are **reporting**. A rule never triggers a price change, and a failure in the
alert path never reaches a pricing decision (doc 07 §1.1's isolation, unchanged).

An alert is a **state**, not a log line. "Seller X appeared" is an event; "seller X is still
below your floor" is a condition with a beginning, a duration and an end, and the second is what
an operator acts on. So the screen shows open conditions, each with when it started, when it was
last confirmed, and the offers that prove it.

**Rule shape** — one sentence with four blanks, so a new alert kind is an enum value rather than
a migration:

| Blank | Values |
|---|---|
| Scope | one listing / one stock code / one marketplace / everything |
| Subject | one seller / a seller group / anyone |
| Condition | is present / is priced below |
| Threshold | a fixed amount / our price / our floor / a % below ours |

Thresholds are `bigint` kuruş; a fixed threshold is money like any other. Fixed thresholds are
supported because some products have a floor the market itself enforces and someone breaking it
is the signal — but they go stale and nobody revisits them, so a fixed rule is displayed with a
standing reminder that the market may have moved away from it.

**The rule editor refuses rules that cannot fire.** An alert rule does not fail loudly; it fails
*silently*. A rule naming a mistyped stock code, an archived listing or a seller never seen
saves cleanly, lists cleanly and simply never matches, and the operator then reads an empty
alerts screen as "nothing is wrong". Every reference is therefore resolved against the database
before the rule is stored, and one that does not resolve is rejected with the reason. For the
same reason the rules list names the *target* — the product, the marketplace, the seller — and
shows `(bulunamadı)` where a reference has since gone away.

Targets are picked, not typed: listings by product search, sellers and groups from what the
scrapes have actually recorded. The one free-text target is the stock code, which is checked
against `stock_items` on save.

A **seller** subject is matched by marketplace seller ref alone, and the same digits can be two
unrelated companies on two marketplaces. Where a ref is recorded on more than one marketplace
the editor requires the scope to bound it to one (or to a single listing, which is on one).
Asserting that two refs *are* one company is what a seller group is for, and that stays a
deliberate operator act (§6.1).

**Money is typed in lira and echoed back before saving.** The input takes Turkish notation with
a comma for kuruş; a dot is only accepted as a thousands group, so `400.50` is rejected rather
than read as ₺400.500. The parsed amount is shown under the field as the operator types, because
a threshold wrong by 1000× saves without complaint and then never fires.

**One breach, one row.** A rule about *anyone* keys per listing and carries its offenders as
children, each with its own joined/left timestamps. A market-wide collapse is one dashboard row
that opens to show six sellers, not six rows to reassemble. A seller joining an already-open
breach updates that alert rather than opening another — but the join is timestamped, so it can
drive a notification later without becoming a separate row.

**Quiet period.** After an alert resolves, the same target stays silent for a rule-configured
interval. Without it a competitor oscillating around the threshold reopens an alert every cycle
until the operator stops reading the screen.

**Evidence.** Each alert stores the offers, prices, ranks and threshold as they stood when it
fired, including *which price field* the comparison used (`finalPrice` where published, `price`
otherwise). It is held on the alert rather than looked up later because
`competitor_observations` is pruned at 90 days and the offers behind an old alert would
otherwise simply vanish.

**Staleness is the loudest thing on the page.** Zero open alerts beside a scraper that has not
succeeded in a day is not "all clear", it is "we have not looked", and the two are
indistinguishable unless the screen says so. The per-marketplace freshness banner is measured
from successful scrapes only, and the dashboard tile never shows the open count without it.

An alert is never opened or resolved by a failed scrape: a page we could not read tells us
nothing about the condition, and resolving there would report "all clear" on the strength of a
network error.

---

## 7. Jobs (`/jobs`)

Run history with state, duration, item counts and errors. Per job: schedule (operator-editable,
§7.3), status, last run, next run, enable/disable, run-now. Queue depth and currently-claimed
jobs. Circuit-breaker state per marketplace with a manual reset.

### 7.1 Live run state

The worker and the web app are separate processes (doc 10 §2), so **a run is only observable
through the rows the worker writes.** The screen polls: fast (~1.5s) while anything is queued,
running or expanded, slow (~15s) otherwise, and not at all while the tab is hidden.

- **Run-now acknowledges immediately.** Pressing *Çalıştır* enqueues a `job_queue` row; the
  worker's scheduler needs up to one tick (doc 07 §8) to claim it. The button reports
  *Kuyruğa alındı* for that gap rather than snapping back, and gives up after ~20s — a click
  the worker never acknowledges means the worker is down, and the screen must say so.
- **Run-now is disabled while the job is queued or running**, derived from `job_queue` and
  `job_runs`, not from local UI state. So it survives a page reload and covers a run this
  browser did not start. A second concurrent `ScrapeCompetitors` in particular is exactly the
  aggressive pattern api-references §1.6 warns about.
- **Durum** column: *Çalışıyor* (with `items_done`/`items_total`), *Kuyrukta*, or *Boşta*.

### 7.2 Run detail (*Detaylar*)

Expands in place under the job's row, showing that run's progress and the events it logged.
Shows the live run when there is one, otherwise the last finished one — "what did the last run
actually do?" is the same question.

- Progress bar from `job_runs.items_done`/`items_total`; indeterminate until the handler
  reports a total, because a job that has not yet decided how much work it has is not at 0%.
- The item in flight, from `job_runs.current_item` — for `ScrapeCompetitors`, the stock code
  and product name of the page being fetched, reported **before** the fetch, since the wait is
  what the operator is watching.
- `items_ok`/`items_failed` only once the run has settled: `finish` writes them at the end, so
  showing them mid-run would read as "everything failed".
- A stall warning when a `running` row's `progress_at` has gone quiet for ~45s. A
  rate-limited scrape is *meant* to be slow; a silent one usually means the worker died.
- The run's `app_events`, at `debug` and above, newest last. doc 07 §7's "per-failure silence"
  governs *alerting*, not the diagnosis this panel exists for.

Progress is **reporting only**: a handler that never reports one is fully supported (its panel
shows counters without a bar), a failed progress write never fails the run, and no decision
anywhere may branch on it.

**Tarama Hızı** (doc 08 §12): per-marketplace requests/minute and burst for the reporting-only
competitor scrapers, editable and audited like every other setting. Shows the effective value
(a stored override, or the compiled default when none is set) and whether it is currently
overridden. Takes effect on the worker's next restart — the UI says so, rather than implying an
immediate effect it cannot deliver.

### 7.3 Cadence editing (doc 07 §8.1, R-JOB-2)

The catalogue table's *Sıklık* column is a numeric field (seconds), one per cadence-driven job
(every job in doc 07 §1 except `ImportBundles`, which has no cadence at all and shows "Yalnızca
manuel" instead). Next to it: the currently effective value in human units (`formatCadence`,
e.g. "30 dakikada bir"), a *Kaydet* button, and a *Varsayılana dön* button that only appears once
an override is stored — clearing it is a distinct action from typing the default value back in,
since only the former lets the operator later tell "no override" from "override that happens to
match default". A note above the table repeats the same restart-to-apply honesty §7.2 already
gives the scrape rate limit: a saved cadence takes effect on the worker's next restart, not live.

*Sonraki Çalışma* is computed from the cadence the **running worker** booted with, never from the
stored setting. Saving an override used to move that column immediately while the worker kept
firing on its old interval — the screen predicting runs at times nothing would run at, one column
away from the note saying the change needed a restart.

Where the two disagree the row carries a persistent warning — *"Kaydedildi, henüz geçerli değil —
worker <x> çalışıyor. Yeniden başlatın."* Persistent is the point: the transient "Kaydedildi"
confirmation vanishes on the next reload, so an operator who saved yesterday had nothing left
telling them the value was not in effect. The state is derived server-side (`pendingRestart` on
`GET /api/jobs`) from the same comparison, so it cannot drift from the badge.

**Worker'ı Yeniden Başlat** sits above the table, next to that note, and carries a count of the
pending changes when there are any (`3 bekleyen`). It restarts the worker in place — not the
`BuyBoxApp` service — so this page keeps its connection and shows the outcome; see doc 07 §8.1
for why that distinction is what makes the button possible at all. It exists because the
documented way to apply a cadence was `Restart-Service BuyBoxApp` from an elevated PowerShell
prompt, which is not an action an operator will take to change how often a job runs. When jobs
are running the button says so — they are drained, not killed, so the click takes as long as the
longest in-flight handler. Where no worker runs in this process (a standalone `apps/worker`
deployment) the route answers 409 saying which, rather than reporting a restart of nothing.

---

## 8. Events (`/events`)

Persisted, filterable replacement for the legacy transient text box. Filter by level,
marketplace, listing, job run, date range, code. Each row links to its listing or job run.

---

## 9. Settings (`/settings/*`)

| Page | Contents |
|------|----------|
| Marketplaces | Enable/disable, merchant ref, credentials (write-only, with a Test button), capabilities |
| Fees | Per marketplace, effective-dated. Commission VAT rate and treatment, cargo bands, expenditure bands. **Live floor-price preview** for a sample cost and VAT rate |
| Policy | Per marketplace: steps, tolerance, seek strategy, sole-seller margin, stock mode, low-stock guard, settle duration, poll interval, concurrency, daily budget and reserve |
| Product sources | Choose and configure; column mapping for Excel; Test; ERP options shown disabled as "yakında" |
| Retention | Per-table windows (doc 05 §10) |
| Database | Engine, connection, schema version, migration status |

Every change is audited and shows who changed it, when, and from what.

Fee and policy edits offer **"preview impact"**: run the engine in shadow over the current
catalogue and report how many listings would change price and by how much, before saving.

---

## 10. Cross-cutting requirements

| ID | Requirement |
|----|-------------|
| R-UI-1 | Money is `bigint` kuruş internally; formatted in Turkish locale only at display |
| R-UI-2 | Competitor attributes are separate typed fields, never composite strings |
| R-UI-3 | Marketplace-pushing edits confirm, show pending/succeeded/failed, and never truncate decimals |
| R-UI-4 | Filters are built structurally and executed server-side |
| R-UI-5 | Grids are server-paged and virtualised |
| R-UI-6 | The operation log is persisted and filterable |
| R-UI-7 | Long operations report coherent progress and are cancellable |
| R-UI-8 | Every listing's current price is explainable from the UI without reading logs |
| R-UI-9 | Kill switches are reachable within one click from any screen |
| R-UI-10 | The UI works against all three database engines with no behavioural difference |
| R-UI-11 | Interface language Turkish; number and date formatting Turkish locale |
| R-UI-12 | Every table screen's columns can be shown/hidden, reordered and resized, remembered per browser via `localStorage`; server-sortable columns are sortable from the header |
| R-UI-13 | Every table screen offers a CSV ("Excel'e Aktar") export of what the grid currently shows, honouring the active filters |
| R-UI-14 | A product is named `Marka - Ürün Adı` wherever it is shown, on screen and in exports |

Column customisation (R-UI-12) lives in `useColumnPrefs`/`ColumnMenu`/`ResizableTh`
(`components/table.tsx`) and is wired up on `/listings` as the reference implementation
(customer feedback 2026-08-25). CSV export (R-UI-13) is `lib/csv.ts`'s `downloadCsv`, wired up
so far on `/stock`, `/alerts`, `/competitors`, `/competitors/sellers`, `/events` and
`/watched-brands` (client-side, from data already loaded in the browser), and **server-side**
on `/listings` and `/tracked-products` (capped at 5,000 rows — see the comment on
`CSV_EXPORT_LIMIT` in either route for why the per-row enrichment is skipped in the export).

The distinction matters: a client-side export can only offer what is on screen, so it is right
only for a screen whose endpoint already returns the whole bounded result. `/listings` and
`/tracked-products` are server-paged, so their exports run the **same filters** against the
database and return the whole filtered set — the grid's 50 rows and the export's 5,000 come
from one `filterParams()` in the client, precisely so the two cannot disagree.

Column customisation and export are both wired up on `/listings`, `/tracked-products`,
`/competitors/sellers` and the seller-detail sub-page
`/competitors/sellers/[marketplace]/[ref]`. Not yet rolled out: `/jobs` (run history) — copy the
pattern from one of the screens above rather than inventing a new column-prefs or export shape.

**Saved filter presets** (§4.4) are `useFilterPresets` in the same module, added 2026-08-28 and
first used on `/tracked-products`. Same storage contract as column preferences and for the same
reason: a filter set is a working habit, not shared configuration — two operators on one install
want different shortlists and neither wants the other's. Should presets ever need to be shared
between people, that is a different feature with a different home (a settings table), not a
widening of this one.

Product naming (R-UI-14) is `lib/product-name.ts`'s `withBrand`, applied **server-side in the API
routes**, not per screen: the brand lives on `listings.brand_id` (§12.1) while the title lives on
`listings.product_name`, and composing once at the route means the grids, the detail screens and
the CSV exports cannot drift apart. See §12.3.

---

## 11. Dark mode (built)

A Light / Dark / System theme toggle is planned. On 2026-08-18 four dark-mode directions were
mocked up against the real Dashboard layout (sidebar, KPI cards, the price-monitoring grid) and
reviewed with the product owner in a Claude Design canvas. The chosen direction was
**Option 2 — "Yüksek Kontrastlı Veri Paneli"** (trading-terminal style): near-black surfaces,
strong contrast, vivid signal colours pulled forward for status, tabular-figure numerics. When
this is built, implement it — not one of the other three explored directions — and validate
contrast (WCAG AA) before shipping.

Token values captured from the chosen mockup, to seed `globals.css`'s dark palette:

| Token | Value | Notes |
|---|---|---|
| `--color-bg` (dark) | `#05070a` | page background |
| `--color-surface` (dark) | `#0a0e15` | cards, sidebar, table |
| surface-2 (dark) | `#0d1220` | sticky table header, sidebar-adjacent panels |
| `--color-border` (dark) | `#1c2430` | |
| `--color-text` (dark) | `#f4f6f9` | |
| `--color-muted` (dark) | `#7c8798` | |
| `--color-accent` (dark) | `#22d3ee` | replaces `#2563eb` in dark mode; accent-on-text `#04141a` |
| `--color-danger` (dark) | `#ff3b47` | tint bg `rgba(255,59,71,0.16)` |
| `--color-warning` (dark) | `#ffb020` | tint bg `rgba(255,176,32,0.14)` |
| `--color-success` (dark) | `#16e37e` | tint bg `rgba(22,227,126,0.14)` |

Numeric table columns (prices) use a monospace/tabular-nums treatment
(`ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace`) rather than the
light theme's default sans stack — this is specific to the chosen direction and should carry
over to the real implementation.

Both things this section once listed as unscoped are now settled. The toggle is a `data-theme`
attribute plus a stored preference, stamped on `<html>` before first paint by the inline script
in `theme-init-script.ts`, with the `prefers-color-scheme` media query covering "Sistem"; the
palette lives in `globals.css` and is applied twice, once per mechanism. And the sweep of the
`apps/web` screens for hardcoded (non-token) colours was carried out on 2026-08-26 — see §11.1.

**One token is still unimplemented:** the table above lists a *surface-2* (`#0d1220`) for the
sticky table header and sidebar-adjacent panels. `globals.css` has no such token, and
`.table-sticky-head th` paints `--color-bg` instead. That is correct today because the grids sit
directly on the page background rather than inside a surface card, so a header painted
`--color-surface` would be the odd one out; add surface-2 when a grid is first placed inside a
card, not before.

### 11.1 Colour sweep and contrast audit (2026-08-26)

Every `.tsx` under `apps/web/src` was swept for colour that does not come from a token — Tailwind
palette utilities (`bg-white`, `text-gray-500`, …), hex and `rgb()`/`hsl()` literals, and inline
`style` colour props. **There are none**: the only colour any screen names is a
`…-(--color-…)` token, and the two inline sparklines pass tokens through `stroke`. Nothing
needed changing for the sweep itself.

The token pairs were then measured for WCAG AA contrast (4.5:1 for body text) in both themes —
each status hue on `--color-bg`, on `--color-surface`, on its own `-bg` tint and on `--color-hover`,
each `-ink` on its solid fill, and `--color-muted` on every surface it lands on:

- **The dark palette passes**, mostly comfortably (status hues 5.5–11:1).
- **The light palette's warning and success failed outright** — `#d97706` and `#16a34a` measured
  3.0–3.3:1 everywhere, including white `-ink` on the solid fill, because both are read as text
  far more often than they are used as a fill. Both moved one step darker, to the 700 weight
  (`#b45309`, `#15803d`), and `--color-danger` went with them (`#dc2626` → `#b91c1c`, which was
  the one that dipped to 4.41:1 on its own tint) so the three behave as one family. Every light
  pair now clears 4.5:1.
- **Left alone, deliberately:** `--color-muted` reaches 4.34:1 in its worst composite (light
  mode, on a hover row or a danger tint) and 4.44:1 in dark (on the success tint). Darkening it
  would touch the ~230 places muted text is used and flatten the hierarchy against
  `--color-text`, to close a gap of under 0.2. Revisit only as part of a deliberate pass on
  secondary text.

When adding a status colour or changing one of these, hold the rule the light palette's comment
in `globals.css` states: at or above 4.5:1 on `--color-bg`, on `--color-surface` and on the hue's
own `-bg` tint, with `-ink` clearing 4.5:1 on the solid fill.

**Native form controls (customer feedback 2026-08-25):** `<select>`'s closed box picked up the
token colours because we style it directly, but its open dropdown list is rendered by the
browser/OS and was still following the light UA default even under the dark palette — the
missing piece was the `color-scheme` CSS property, which nothing in `:root` declared. Fixed by
setting `color-scheme: light` on the default `:root` and `color-scheme: dark` in both places the
dark palette is applied (the `prefers-color-scheme` media query and `[data-theme='dark']`), so
native chrome (`<select>` popups, scrollbars, default control borders) tracks the same theme as
everything else on the page. Any other native, browser-rendered control found off-palette later
belongs to this same gap, not a new one.

**Follow-up (customer feedback 2026-08-26):** `color-scheme` was necessary and not sufficient.
The dropdown list came back a second time — dark box, but options in dim, near-illegible text —
because Tailwind's preflight resets `select` to `background-color: transparent`, and the popup
takes its colours from the `<select>`'s own computed background and colour. A control with no
background of its own leaves the browser to pick, and it picked the platform default. Fixed in
`globals.css` by painting `select`, `option` and `optgroup` with `--color-surface`/`--color-text`
directly — once, globally, since every filter on every screen is a bare `<select>` carrying only
border and spacing classes, and repeated on `option`/`optgroup` because Windows needs the rows
painted explicitly rather than inheriting from the control. The lesson generalises: for a
browser-rendered control, `color-scheme` sets the *theme* but only an explicit
background/colour on the element sets the *palette*.

---

## 12. Customer feedback backlog (2026-08-25)

Both items below were proposals as of the first pass through this backlog; the product owner
picked a direction for each (2026-08-25, recorded via the options below) and both are now
**built**. Kept here as the design record — read this before touching either area again.

### 12.1 Brand/category browsing — built

*"Pazaryerlerindeki marka ve kategori bilgileri gelmeli. Marka/kategori üzerine basınca o
markaya ait ürünler görünmeli."*

Decided: **normalised `brands`/`categories` reference tables** (doc 05 §4), not a denormalised
column on `listings`, and **a dedicated `/brands` screen** (§1 above) rather than a filter-only
approach — both picked as the recommended option when reviewed.

Sourced from Trendyol's product filter response (api-references.md §1.4 — `brand{id,name}`,
`category{id,name}`), the same call `ImportListings` already makes; no new marketplace call.
Hepsiburada's Listing service has neither field (api-references.md §2.4), so `brandId`/
`categoryId` stay `null` there — not faked, not backfilled from anywhere else.

`/brands` lists every brand with its (non-archived) listing count, descending; clicking one
navigates to `/listings?brandId=…`, which the Listings screen seeds into its own **brand
dropdown** in the filter bar rather than leaving as hidden query-string state. (The first cut
showed it as a dismissible chip instead; that was replaced on 2026-08-26 because an operator
already on the Listings screen had no way to narrow by brand without leaving it and coming back.
Link and dropdown share one piece of state, which is what stops the visible control and the
filtered grid from disagreeing.) `/categories` was not built as a separate screen
in this pass — `categoryId` is captured and filterable via `listingsRepo.queryListings`, but has
no browse UI yet. Copy the `/brands` pattern if that screen is wanted later.

### 12.2 Competitor tracking for products we don't sell — built (v1: add-by-link)

*"Satılmayan / ürün kartına girilmemiş ürünlerde de rakip takibi yapılabilmeli... sadece ürün
linki ile ekleme yapılabilmeli."*

Decided: **a new `tracked_products` table** (recommended option), refined during implementation
into **its own parallel `tracked_product_observations` table** rather than the originally
sketched "nullable `listings.competitor_observations.listing_id` + parallel
`tracked_product_id`" — see doc 05 §5's `tracked_products` entry for why: it keeps
`competitor_observations` and every query built against it (`observationsAsOf`, the §6/§6.1
reports) completely untouched, and makes the pricing-path isolation *structural* rather than a
guard someone has to remember to write — `Reprice`/`ObserveBuybox` (doc 07 §2.1/§2.2) query
`listings` alone, and a tracked product has no row there at all, in any shape.

Also decided: **v1 ships add-by-link only** — no brand-wide search UI. `parseProductLink`
(`packages/adapters/src/parse-product-link.ts`) turns a pasted Trendyol or Hepsiburada product
URL into a `ProductPageRef` offline (no request); `/tracked-products` is the list + add form.
Scraping runs as the last step of each per-marketplace `ScrapeCompetitors` run
(`pipeline/scrape-tracked-products.ts`), isolated by its own `try`/`catch`, and is subject to
the same "disabled by default" switch as the rest of that job (doc 07 §7) — there is no separate
toggle for tracked products.

**Deferred, not decided against:** brand-wide search (picking a product from a marketplace
brand's full catalogue rather than pasting a link) needs the public brand-page source
(trendyol-merchants-scraping-guide.md), not the authenticated Product Integration API — that API
only sees our own catalogue. Revisit as a follow-up if link-only proves too manual in practice.

**Detail screen `/tracked-products/[id]`** (customer feedback 2026-08-25, follow-up: *"onların da
aynı şekilde `/listings/[id]` tarzı bir ekranı olsun ve bütün satıcılarının fiyatlarını ve
stoklarını görmek istiyorum"*). Every seller was already being recorded — `scrapeTrackedProducts`
writes one `tracked_product_observations` row per offer per look — and the list screen was showing
only the rank-1 row, so this screen surfaces what was already there rather than collecting
anything new.

Four things the listing detail (§5) has that this one deliberately does **not**: the cost
waterfall, the engine panel, the manual-price form and the min/max bounds. We do not sell this
product, so there is no cost, no engine state and nothing to submit — the screen is
reporting-only, in the same sense as §6.

What it shows: a *Şu An* summary (buybox seller and price, cheapest offer, seller count, total
visible stock, last look and its status), a **sellers table** — rank, seller, price, price move
since the previous look, customer price, stock, last seen — and a buybox price history with the
same dependency-free inline sparkline §5 uses. A seller row expands to that seller's own series
across the window.

Two decisions inside it:

- **A seller that leaves the page keeps its row**, greyed and marked *teklifte değil*, ordered
  after the current offers. A competitor withdrawing is information; dropping the row would
  render it as an absence the operator cannot see.
- **Seller identity is `seller_ref`**, with a fallback to the folded display name **only** when
  the payload carried no id — and the expanded row says so. That fallback groups rows within one
  product's own history for display; it is never an identity claim, which is the distinction
  `competitor_seller_groups` (doc 05 §5) exists to protect across marketplaces.

Fed by `trackedProductsRepo.trackedProductObservationsSince`, which reads the whole 30-day window
in one query: a seller that vanishes has no row in the newer looks, so there is no way to notice
its absence except to hold the older ones.

**Known gap:** `tracked_product_observations` has no retention window yet (doc 05 §10) and
grows without bound. Low risk while the tracked-product set stays small and operator-curated,
but should get a window before this sees sustained use — and the detail screen above now reads
that whole history per view, so the window matters a little more than it did.

### 12.3 Brand first in every product name — built (R-UI-14)

*"Bütün ürün gösterimlerinde Marka başta olsun."* — `Sığır Etli Kısırlaştırılmış Kedi Maması
1,4 Kg` should read `Whiskas - Sığır Etli Kısırlaştırılmış Kedi Maması 1,4 Kg`.

Composed at display time by `lib/product-name.ts`'s `withBrand`, from `brands.name` joined
through `listings.brand_id` (§12.1). **Nothing is written back to `listings.product_name`** —
that column stays exactly what the marketplace returned, so an import never has to reconcile our
label with theirs and a brand rename shows up everywhere at once.

Composed **server-side in each API route** rather than in each screen: ten screens name a
product and only one shape of name is wanted. Routes covered: `/api/listings` (grid *and* its
CSV export), `/api/listings/[id]`, `/api/alerts` (alert rows and listing-scoped rule labels),
`/api/dashboard`, `/api/competitors`, `/api/competitors/listings`,
`/api/competitors/sellers/[marketplace]/[ref]`, `/api/competitors/overlap` and
`/api/settings/preview-impact`.

The brand lookup is `catalogRepo.brandNamesByListingIds` — keyed by listing id so a route only
needs ids it already has, instead of a brand join being threaded through a dozen
dialect-triplicated report queries. `/api/competitors/overlap` is the one exception and joins
`brands` in SQL, because that report is keyed by stock code and never names a listing.

Two behaviours worth keeping: a title that already opens with its own brand is **normalised**,
not prefixed twice (`Whiskas Sığır Etli Mama` → `Whiskas - Sığır Etli Mama`), and a listing with
no brand — every Hepsiburada row today (§12.1) — shows the bare product name, unchanged. Brand
matching folds case both Turkish-locale *and* invariant: Turkish folding maps `I`→`ı`, so on its
own it fails to recognise the very common all-caps title `WHISKAS …` as already carrying the
brand `Whiskas`. `withBrand`'s doc comment and its table-driven test carry the detail.

**Out of scope:** `/stock` names stock items by the operator's own `stock_items.name`, which has
no brand relationship at all — it is master data we key on, not a marketplace title.
