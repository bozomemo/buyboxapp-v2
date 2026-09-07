# 15 — Phase 7 sweep report

**Scope:** doc 15 §6 Phase 7 ("Shell and final consistency sweep"). Part A (`nav-shell.tsx` fix +
smoke test) is implemented and committed. This document is Part B: a report-only pass re-asking
§5's 12 questions across every screen Phases 1–6 touched, looking for app-wide drift. Nothing
below was changed except items explicitly marked **fixed (one-line)** — everything else is a
finding, not a patch.

Read against: §1–§4 (their "Do not run the app" notes), §5, §6 Phase 7 only, §8. No other
screen brief was read, per the task's instruction.

---

## 1. What Part A changed

`apps/web/src/app/nav-shell.tsx`:

- `SystemPauseButton` and `LicenseGraceBanner` each used to fold "the fetch failed" into the
  same `undefined`/hidden branch as "nothing to show" (`.catch(() => undefined)`). That was
  defensible the day these routes could 500 before the setup wizard had run; it stopped being
  defensible once `NavShell` started returning bare `children` for `/setup` — by the time this
  chrome renders at all, the app is bootstrapped, so a failure here is a real one (route threw,
  network dropped), not "not configured yet."
- Added a small local `usePoll<T>` hook (loading/error/ready) used by both. Errors now render
  visibly: a "Sistem durumu alınamadı — Tekrar dene" button in the header, and a red "Lisans
  durumu okunamadı… Tekrar dene" banner — neither blocks the rest of the shell, since this is
  persistent chrome, not a screen's primary load.
- The system-pause vs. price-submission-kill-switch separation was **not touched**: nav-shell
  still owns only `/api/system-pause`; `dashboard-client.tsx`'s `PriceSubmissionSwitch` still owns
  `/api/kill-switch`, exactly as `CLAUDE.md` and the existing doc comments describe. Verified by
  reading both call sites before editing.
- New smoke test `apps/web/src/app/nav-shell.test.tsx` (loading / error+retry / empty=steady-state
  / populated=paused+grace-banner), modelled on `fees-client.test.tsx`. 4/4 pass.

Verification run (see below): `typecheck`, `eslint`, `prettier --check` on the touched files, and
the full `apps/web` test suite (40 files / 294 tests) all pass.

---

## 2. Findings (not fixed, except where marked)

### 2.1 Raw enum reaching the screen — **fixed (one-line)**

`apps/web/src/app/settings/policy/policy-client.tsx:441` rendered `{s.reason}` directly in the
policy-preview sample table. `s.reason` is `packages/core`'s `DecisionReason` (via
`/api/settings/preview-impact`'s `decision.reason`) — the same enum `dashboard-client.tsx` already
translates through `DECISION_REASON_LABELS`. This screen showed the operator raw English values
(`Seeking`, `HoldingOptimum`, …) in its "Sebep" column. Fixed by importing `labelOf` and
`DECISION_REASON_LABELS` from `lib/labels.ts` and wrapping the cell — one import line, one call
site. Re-verified with `eslint`, `prettier --check`, and `npm run typecheck` (all clean).

### 2.2 `/jobs` has no column preferences and no CSV export

`jobs-client.tsx` renders three `TableFrame` tables (job catalogue, run history, per-marketplace
circuit state) but imports neither `useColumnPrefs` nor `downloadCsv` — the only screen among the
16 `TableFrame` users with zero of either. Doc 15 §7 named `/jobs` as the Tier A screen to redesign
*first*; §8's definition of done says "every grid screen has column preferences (R-UI-12) and a
CSV export (R-UI-13)." This is the clearest remaining gap against that line. Not fixed here — it
is a real IA/feature addition (deciding which columns of three different tables are worth
customising, and what a run-history export should honour as filters), not a one-liner.

### 2.3 `docs/06-user-interface.md` §10's CSV rollout list is stale

§10 states CSV export (R-UI-13) is "wired up so far on `/stock`, `/alerts`, `/competitors`,
`/competitors/sellers`, `/events` and `/watched-brands` … and server-side on `/listings` and
`/tracked-products`." Grepping `downloadCsv` usage today shows it is also wired on `/brands`,
`/competitors/sellers/[id]` (seller detail), `/listings/[id]` (listing detail),
`/tracked-products/[id]` (tracked-product detail), `/watched-brands/comparison`,
`/watched-brands/cross-marketplace`, `/watched-brands/policy`, `/watched-brands/sellers`, and
`/watched-brands/findings` — none of which §10 mentions. Per doc 15 §4 step 5 ("when code and spec
disagree, one of them is changed deliberately and stated"), each Tier B–D screen's own agent
should have appended itself to this list and didn't. Reported rather than fixed, since re-auditing
which of those exports are client-side vs. server-paged (the distinction §10 explains) is more
than a one-line change to get right.

### 2.4 Column preferences still absent on several `TableFrame` screens

Of the 16 screens using `TableFrame`, 7 also use `useColumnPrefs`
(`competitors/sellers`, its seller-detail, `/listings`, `/stock`, `/tracked-products`,
`/watched-brands/sellers`, `/watched-brands`). The rest — `/brands`, `/competitors`, `/events`,
`/jobs` (2.2 above), `/watched-brands/comparison`, `/watched-brands/policy` — do not. Some of
these may be deliberately exempt (a comparison grid or a 19-field-form screen's small sellers
table may not carry enough columns to be worth customising), but that judgement was not made
explicit anywhere I could find, and §8 states the requirement as "every grid screen" without
carving out exceptions. Worth a deliberate pass rather than a blanket rollout.

### 2.5 `dashboard-client.tsx` still hand-rolls `window.confirm` instead of the kit's `ConfirmButton`

`ConfirmButton` (§1a, added for exactly this) is used in 7 screens, but `dashboard-client.tsx`'s
own `PriceSubmissionSwitch` (line ~493) and its per-marketplace kill-switch toggle (line ~601)
both call `window.confirm` directly, predating the component. Doc 15 explicitly leaves the
dashboard alone ("Deliberately not changed: the aggregate route…"), and its confirmation asymmetry
is correct (resuming/enabling confirms, disabling/pausing doesn't) — this is a component-reuse nit,
not a behavioural defect. `settings/marketplaces/marketplaces-client.tsx:127` has the same nit: a
raw `window.confirm` with the right asymmetry, not routed through `ConfirmButton`. `nav-shell.tsx`
inherited the same pattern for `SystemPauseButton`'s resume confirmation; Part A above deliberately
left this alone (its asymmetry was already correct, and the task's named defects were the two
swallowed fetches, not the confirm mechanism) but it's the same nit as the other two.

### 2.6 `ImportPanel`'s config poll (`stock-client.tsx:300`) folds a real failure into "not configured"

```
fetch('/api/product-source/config')
  .then((r) => r.json())
  .then(setConfig)
  .catch(() => setConfig({ configured: false }));
```

A genuine network failure here renders identically to "no product source configured yet," which
could send an operator on a live install into the wrong setup flow after a transient error. This
is the same shape of bug Part A fixed in `nav-shell.tsx`, on a screen Phase 7 was not scoped to
touch. Flagged for whichever pass next touches `/stock`, since fixing it properly needs its own
error/retry state, not a one-line change.

### 2.7 Terminology and busy-state vocabulary — no drift found

Checked for the class of defect the baseline recorded (§1, "ad-hoc `*_LABELS` maps," "same concept
different word"). Result: `grep -rn "_LABELS: Record" apps/web/src/app` returns only
`setup/wizard-types.ts`'s `STEP_LABELS` (the documented, sanctioned exception) and a comment
mentioning the pattern by name, not a declaration. `grep -rln "setup/ui" apps/web/src` returns
nothing. Busy-state verbs differ by *kind* of action, not by screen inventing its own word for the
same thing: "Kaydediliyor…" for form saves (14 files, consistent), "Gönderiliyor…" for marketplace
price submissions (2 files), "Uygulanıyor…" for a switch-style toggle (`nav-shell.tsx`,
`dashboard-client.tsx` — the same two screens that share the system-pause/kill-switch split), and
one "İşleniyor…" for a bulk multi-row action on `/listings`. Each maps to a genuinely distinct
action, not a synonym collision.

### 2.8 Six-state contract — essentially complete

`ErrorState` and `LoadingState` are each imported in 25 of 26 `*-client.tsx` files; the one
exception, `dashboard-client.tsx`, predates the kit (it is the reference implementation the kit
was extracted from) and implements the same contract inline (its own early-return error/loading
branches, matching §3.2's description of it as "the reference for all six states"). Every
`*-client.tsx` has a matching `*-client.test.tsx` (checked by filename substitution — no gaps).
No snapshot files exist anywhere under `apps/web` (`find … -iname "*.snap" -o -ipath
"*__snapshots__*"` → nothing).

Remaining `.catch(() => …)` sites (12, down from the baseline's 17) were individually read; all
are secondary/supplementary fetches with an explicit comment justifying the swallow (autocomplete
suggestions, a filter dropdown's option list, best-effort `/api/health` enrichment, an evidence
panel's on-expand detail fetch) — none are a screen's primary load. This matches §8's "no
`.catch(() => …)` on a primary load," with 2.6 above as the one soft exception found (a
config-poll result, not strictly a "load," being used to gate which UI mode renders).

---

## 3. Definition-of-done checklist (doc 15 §8)

| Item | Status |
|---|---|
| Every screen satisfies §3 in full | **Mostly** — six states and confirmation asymmetry check out (2.7, 2.8); column preferences / CSV export are incomplete on several grids (2.2, 2.4) |
| `grep -rn "_LABELS: Record" apps/web/src/app` → nothing | **Met**, modulo the documented `STEP_LABELS` exception |
| `grep -rn "setup/ui" apps/web/src` → nothing | **Met** |
| Every primary load has an error state with retry; no silent `.catch` on one | **Met** (2.8), with 2.6 as a borderline case on a non-screen-load poll |
| Every grid screen has column preferences (R-UI-12) and CSV export (R-UI-13) | **Not met** — see 2.2 and 2.4 |
| `docs/06-user-interface.md` describes the screens as they now are | **Mostly** — §10's CSV rollout list is stale (2.3); the rest of the doc is actively maintained through 2026-09-07 |
| Every screen has a passing smoke test (loading/error+retry/empty/populated) | **Met** — every `*-client.tsx` has a matching test file; `nav-shell.tsx` now does too |
| `apps/web/vitest.config.ts` exists and `@/` resolves | **Met** |
| No snapshot files anywhere under `apps/web` | **Met** |
| Typecheck, lint, prettier and tests pass across the workspace | **Met for the files this task touched** (`npm run typecheck`, targeted `eslint`/`prettier --check`, full `apps/web` test suite: 40 files / 294 tests). Two **pre-existing, out-of-scope** issues found while sweeping: `apps/web/src/lib/csv.ts:10` fails `eslint`'s `no-irregular-whitespace` (a BOM byte, deliberately documented in a comment about prepending a BOM for Excel — not introduced by this pass); and a broad `prettier --check` over `apps/web/src` reports ~93 files as unformatted, which traces to `core.autocrlf=true` on this checkout giving those files CRLF line endings against the repo's LF-default Prettier config — an environment/git-config difference, not new formatting drift, and it does not affect either file this task edited (both are prettier-clean) |

---

## 4. Commands run

```
npm run typecheck                                                        # clean
npx eslint apps/web/src/app/nav-shell.tsx apps/web/src/app/nav-shell.test.tsx   # clean
npx eslint apps/web/src/app/settings/policy/policy-client.tsx            # clean
npx prettier --check apps/web/src/app/nav-shell.tsx apps/web/src/app/nav-shell.test.tsx apps/web/src/app/settings/policy/policy-client.tsx   # clean
cd apps/web && npx vitest run                                            # 40 files / 294 tests passed
```

The app itself was not run — `apps/web/data/app.db` is a live install, per §4's "Do not run the
app."
