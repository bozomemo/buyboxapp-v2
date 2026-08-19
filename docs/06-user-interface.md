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
| `/competitors` | Competitor history | Time-series reporting over the retained scrape data |
| `/competitors/sellers` | Competitor sellers | The same archive by seller: overlap, pricing behaviour, identity linking |
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
| Competition | Sıra · Buybox Fiyatı · 2. Fiyat · 3. Fiyat · Fark |
| Engine | **Faz** · Optimum Fiyat · Son Karar · Son Gönderim Durumu |
| Controls | Oto BB · Fiyat Artır · Fiyat Düşür · Min Fiyat · Max Fiyat |
| Status | Satılabilir · Kilitli · Askıda · Kampanyalı |

**Competitor price, rating, name and dispatch time are separate typed columns.** The legacy
system packed them into strings like `"9.2 / SellerName"` and `"149.90 / 129.90"` and then
parsed them back to make decisions (doc 09 §12). This must not recur.

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

- Text: marketplace SKU, stock code, product name, brand, category
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

---

## 11. Dark mode (direction chosen, not yet built)

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

Not yet scoped: which mechanism drives the toggle (`prefers-color-scheme` vs. a
`data-theme` attribute + stored preference), and the full sweep of the ~48 `apps/web` screens for
hardcoded (non-token) colours. See doc 12 for when this becomes a build-plan phase.
