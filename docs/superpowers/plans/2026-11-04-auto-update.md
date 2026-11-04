# Fast Component Builds and One-Click Self-Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut release builds from hours to minutes by building per-component archives outside OneDrive, and let an admin install a new release from the app with one click, with automatic rollback.

**Architecture:** `installer/release.ps1` builds five component zips (cached by input), signs an `update.json` manifest with an Ed25519 release key and publishes a GitHub Release on `bozomemo/buybox-releases`. A ticker in the worker fetches and verifies the manifest and downloads changed components into `ProgramData\BuyBox\updates\`. `/settings/update` shows it; "Şimdi kur" triggers the `BuyBoxUpdater` scheduled task, whose `apply-update.ps1` holds pricing, backs up the database, swaps component directories, restarts, health-checks, and rolls back code and database on failure.

**Tech Stack:** TypeScript (strict), zod, `node:crypto` Ed25519, vitest, Next.js 16 route handlers + React client components, PowerShell 5.1 (ASCII only), Inno Setup 6, `gh` CLI, WinSW, `schtasks`.

**Spec:** `docs/superpowers/specs/2026-11-04-auto-update-design.md`

**Refinements of the spec, from reading the code:** (1) the update check is a worker ticker, not a scheduler job — `Scheduler.tick()` does nothing while paused or unlicensed, and the check must run then (spec §5.1); (2) the hold is a `Scheduler` option checked before the system pause, rather than a change to `isKillSwitchEngaged`, which stays a pure function of a stored value (spec §5.2); (3) the admin-only permission used is the existing `settings.manage`; (4) the migration count the updater compares is `/api/health`'s `database.schema.applied`; (5) `/api/update` and `/settings/update` join the licence-exempt prefixes.

## Global Constraints

- Every installer `.ps1` is pure ASCII; Turkish messages without diacritics (doc 14 §8.4). `release.ps1` enforces this on every script it packages.
- The release private key never enters the repository or OneDrive: `%USERPROFILE%\.buybox\release-signing-key.pem`.
- The release key is separate from the licence key; public keys are embedded as a list (`RELEASE_PUBLIC_KEYS_PEM`).
- The update check is outside the pricing path, exempt from the licence gate and the system pause, sends no licence id, user agent `BuyBox/<version> update-check`.
- Never downgrade: a manifest whose `version` is not strictly greater than `APP_VERSION` is ignored.
- Install is never silent: only `POST /api/update/apply` from a user with `settings.manage` (admin-only) starts it.
- Pricing stays held while `ProgramData\BuyBox\updates\hold` exists (fail-closed).
- Component names, exactly: `app`, `node`, `chromium`, `runtime`, `monitoring`. A component zip's top-level directories are the install directories it replaces (`runtime` → `scripts\` + `service\`).
- Default manifest URL: `https://github.com/bozomemo/buybox-releases/releases/latest/download/update.json`; empty `UPDATE_MANIFEST_URL` disables checks. Default `UPDATE_CHECK_INTERVAL` `6h`.
- Build root default `C:\BuyBoxBuild` (`BUYBOX_BUILD_ROOT`).
- Manifest fetch size limit 64 KB; health gate 180 s; keep last 5 pre-update backups; `status.json` history keeps the last 20 entries.
- Adapter-style tests use recorded fixtures; no test calls GitHub.
- Commits touch only the files of their task — the working tree has unrelated uncommitted changes that must not be swept in (`git add <paths>`, never `git add -A`).

## Review Focus

1. **A manifest whose `latest` redirect points at a release without a `.sig`** (the operator forgot to upload it) → check ends `signature-missing`, nothing downloads. Test in Task 5.
2. **The data or install directory unset (developer checkout)** → no ticker, `/settings/update` says "Bu kurulumda otomatik güncelleme yok" instead of erroring. Tests in Task 5 and Task 6.
3. **"Şimdi kur" clicked twice / while an update is running** → second request refused 409 while `lock` exists or `request.json` is pending. Test in Task 6.
4. **The service XML is inside the replaced `service\` directory** → the new `service\` must receive the old `BuyBoxApp.xml` before `install-service.ps1` runs, or network-mode env is lost. Covered by rehearsal U-5 (Task 10) and an explicit step in Task 8.
5. **A previous run left `.new` / `.previous` / `.failed` directories** → the next update and the full installer clean them first; a stale `.new` never gets renamed in. Step in Task 8, check in Task 9.

---

## Phase A — Fast component builds

### Task 1: Release key and manifest primitives

**Files:**
- Create: `scripts/generate-release-keypair.mjs`
- Create: `packages/shared/src/release/public-key.ts`
- Create: `packages/shared/src/release/manifest.ts`
- Create: `packages/shared/src/release/index.ts`
- Modify: `packages/shared/src/index.ts` (re-export `./release/index.js`)
- Test: `packages/shared/src/release/manifest.test.ts`

**Interfaces:**
- Produces:
  - `type ComponentName = 'app' | 'node' | 'chromium' | 'runtime' | 'monitoring'`; `COMPONENT_NAMES: readonly ComponentName[]`
  - `interface ManifestComponent { version: string; sha256: string; size: number; url: string }`
  - `interface UpdateManifest { schema: 1; version: string; releasedAt: string; notes: string; components: Partial<Record<ComponentName, ManifestComponent>> }`
  - `interface InstalledComponents { version: string; components: Partial<Record<ComponentName, { version: string; sha256: string }>> }`
  - `UpdateManifestSchema`, `InstalledComponentsSchema` (zod, `.strict()`; `sha256` = 64 lowercase hex; `url` https only)
  - `RELEASE_PUBLIC_KEYS_PEM: readonly string[]`
  - `signManifest(manifestBytes: Buffer, privateKeyPem: string): string` → base64url signature
  - `verifyManifestSignature(manifestBytes: Buffer, signature: string, publicKeysPem: readonly string[]): boolean` — true if any key verifies
  - `compareVersions(a: string, b: string): -1 | 0 | 1` — dotted numeric `MAJOR.MINOR.PATCH`; throws on non-numeric
  - `componentsToDownload(manifest: UpdateManifest, installed: InstalledComponents | undefined): ComponentName[]` — every manifest component whose sha256 differs from installed (all when `installed` is undefined), in `COMPONENT_NAMES` order

- [ ] **Step 1: Write the key script** modelled on `scripts/generate-license-keypair.mjs`: refuses to overwrite, writes `%USERPROFILE%\.buybox\release-signing-key.pem` (pkcs8) and prints the spki PEM. Header comment states: back it up offline; losing it means the next key ships via the full installer.

- [ ] **Step 2: Run it once and embed the public key**

Run: `node scripts/generate-release-keypair.mjs`
Expected: prints `-----BEGIN PUBLIC KEY-----…`. Paste into `public-key.ts` as the single entry of `RELEASE_PUBLIC_KEYS_PEM`, with a doc comment: separate from `LICENSE_PUBLIC_KEY_PEM`; rotate by appending the next key one release before switching the signer.

- [ ] **Step 3: Write failing table-driven tests** in `manifest.test.ts` (generate a throwaway keypair in `beforeAll` with `generateKeyPairSync('ed25519')`):
  - `verifyManifestSignature`: valid → `true`; one byte of manifest changed → `false`; signature from another key → `false`; key list `[other, signer]` → `true`; empty / non-base64url signature → `false`.
  - `compareVersions`: `('0.2.1','0.2.0')→1`, `('0.2.0','0.2.0')→0`, `('0.1.22','0.2.0')→-1`, `('0.10.0','0.9.9')→1`; `('0.2','0.2.0')` throws.
  - `UpdateManifestSchema`: fixture parses; unknown top-level key fails; `http://` url fails; uppercase sha256 fails; unknown component name fails.
  - `componentsToDownload`: installed undefined → all manifest components; only `app` sha differs → `['app']`; identical → `[]`; manifest lacks `monitoring` → never listed.

- [ ] **Step 4: Run to see them fail**

Run: `npm test --workspace=packages/shared -- release`
Expected: FAIL (module not found)

- [ ] **Step 5: Implement** `manifest.ts`, `public-key.ts`, `index.ts`. Use `node:crypto` `sign(null, bytes, key)` / `verify(null, …)` as `license/verify.ts` does; reuse its `base64UrlEncode`. Signature verification catches any thrown error and returns `false`.

- [ ] **Step 6: Run tests**

Run: `npm test --workspace=packages/shared -- release` → PASS; `npm run typecheck` → no errors.

- [ ] **Step 7: Commit** `scripts/generate-release-keypair.mjs packages/shared/src/release packages/shared/src/index.ts` — "Release key and signed update manifest primitives".

### Task 2: Manifest builder CLI

**Files:**
- Create: `packages/shared/src/release/build-manifest.ts`
- Create: `scripts/release/sign-manifest.mjs`
- Test: `packages/shared/src/release/build-manifest.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `signManifest`, `UpdateManifestSchema`.
- Produces:
  - `interface BuiltComponent { name: ComponentName; version: string; sha256: string; size: number; fileName: string }`
  - `buildManifest(input: { version: string; releasedAt: string; notes: string; releaseDownloadBaseUrl: string; built: readonly BuiltComponent[]; previous: UpdateManifest | undefined }): { manifest: UpdateManifest; newAssets: string[] }` — for each component: if `previous` has the same name **and** sha256, reuse its `url` (asset not re-uploaded); otherwise `url = releaseDownloadBaseUrl + '/' + fileName` and `fileName` goes in `newAssets`.
  - CLI: `node scripts/release/sign-manifest.mjs --components <components.json> --version <v> --notes-file <path> --previous <update.json|none> --base-url <url> --key <pem path> --out <dir>` → writes `<out>\update.json` (2-space JSON, `\n` line endings, trailing newline), `<out>\update.json.sig`, `<out>\new-assets.txt` (one file name per line). Exits non-zero with a message on any error; re-verifies the written signature against `RELEASE_PUBLIC_KEYS_PEM` and refuses if the key on disk is not in the embedded list.

- [ ] **Step 1: Failing tests:** no previous → every component new, urls under base; previous with identical `chromium` sha → chromium url equals previous url and not in `newAssets`; previous with different `app` sha → new url; result passes `UpdateManifestSchema`.
- [ ] **Step 2: Run** `npm test --workspace=packages/shared -- build-manifest` → FAIL.
- [ ] **Step 3: Implement** `buildManifest` and the CLI (CLI imports from `@buybox/shared` like `scripts/issue-license.mjs`).
- [ ] **Step 4: Run** tests → PASS. Smoke the CLI against a hand-written `components.json` in the scratchpad and `--previous none`; confirm three files written and `update.json.sig` non-empty.
- [ ] **Step 5: Commit** the three files — "Build and sign update.json from built components".

### Task 3: `release.ps1` — build outside OneDrive, cached components, timed steps

**Files:**
- Create: `installer/release.ps1`
- Modify: `installer/build-package.ps1` (becomes a wrapper: `& release.ps1 -NoPublish -FullInstaller @PSBoundParameters` with a comment pointing at release.ps1)
- Modify: `installer/buybox.iss:41-50` (`[Files]` sources become `{#LayoutDir}\…` passed with `/DLayoutDir=`, plus `installed.json`; `Compression=lzma2/fast`)
- Modify: `installer/README-build.md`

**Interfaces:**
- Consumes: Task 2 CLI.
- Produces, under `$Root = $env:BUYBOX_BUILD_ROOT ?? 'C:\BuyBoxBuild'`:
  - `<Root>\src` — git worktree of `-Ref` (default `HEAD`) of the repository the script lives in
  - `<Root>\cache\node_modules-<sha256 of package-lock.json>\` and `<Root>\cache\components\<name>-<key>.zip` (+ `.sha256`)
  - `<Root>\out\<version>\` — component zips used by this release, `components.json` (array of `BuiltComponent`), `layout\` (extracted install tree + `installed.json`), `build-<version>.log`, optionally `BuyBoxSetup-<version>.exe`
- Parameters: `-Version` (default root `package.json`), `-Ref`, `-NotesFile`, `-SkipTests`, `-SkipSmokeTest`, `-FullInstaller`, `-NoPublish`; Task 4 adds `-ReleasesRepo` and `-SkipTagPush`.

- [ ] **Step 1: Step timer.** A `Invoke-Step 'name' { … }` helper that logs `-- name` on entry and `-- name <m>m<s>s` on exit and accumulates a summary table printed at the end and written to the log (`Start-Transcript` into `<Root>\out\<version>\build-<version>.log`).

- [ ] **Step 2: Worktree.** When `-Ref` is not given and `git status --porcelain` is non-empty, refuse with "Calisma agaci temiz degil: commit edin ya da -Ref <commit> verin" (an explicit `-Ref` builds that commit regardless of local edits); then `git worktree add --force <Root>\src <ref>` (remove an existing one first with `git worktree remove --force`). Vendored binaries not in git (`installer\vendor\alloy-installer-windows-amd64.exe`) are taken from the **source** repository's `installer\vendor\`.

- [ ] **Step 3: Dependencies.** If `<Root>\cache\node_modules-<lockhash>` exists, copy it to `<Root>\src\node_modules` with `robocopy /MIR /MT:16 /NFL /NDL /NJH /NJS` (exit codes < 8 are success); else `npm ci` in `<Root>\src` and robocopy the result into the cache. Skip Playwright's postinstall download (`$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`); Chromium is a component.

- [ ] **Step 4: Typecheck, test, build** in `<Root>\src`, each its own timed step, same failure messages as today's `build-package.ps1` step 2.

- [ ] **Step 5: Assemble `app`.** Move today's `build-package.ps1` §3 verbatim in substance (standalone flatten, static/public copy, `boot.mjs`, `admin.mjs`, forbidden-state purge and assertion, Playwright overlay, migrations) into a function `Build-AppDir -Into <dir>`; paths now resolve against `<Root>\src`.

- [ ] **Step 6: Components with cache keys.** For each component compute its key, reuse `<name>-<key>.zip` on hit (log "cache hit"), else stage and zip with `tar.exe -a -c -f <zip> -C <stage> <dirs>` (Windows' bundled bsdtar; never `Compress-Archive`, which is far slower):

  | name | stage dirs | key |
  |---|---|---|
  | app | `app\` | always rebuilt; `version` = release version |
  | node | `node\node.exe` | `node --version` |
  | chromium | `chromium\` via `npx playwright install chromium` with `PLAYWRIGHT_BROWSERS_PATH` | `pw-` + `node_modules\playwright-core\package.json` version |
  | runtime | `scripts\` (the ASCII-checked list from today's §7, plus `apply-update.ps1` once Task 8 exists — keep the list in one array), `service\` (`BuyBoxApp.xml.template`, `WinSW.exe` as `BuyBoxApp.exe`) | first 12 hex of sha256 over the input files' sha256s in sorted name order |
  | monitoring | `monitoring\` (Alloy installer + `config.alloy.template`) — skipped with a warning when Alloy is absent | same hashing as runtime |

  Write `components.json` (`name`, `version` = key, `sha256`, `size`, `fileName` = `<name>-<key>.zip`).

- [ ] **Step 7: Layout and checks.** Extract every component zip into `<out>\layout\`; write `layout\installed.json` (`InstalledComponents`); run today's ABI check and smoke test (§5 and §8 of `build-package.ps1`) against `layout\` instead of staging. The smoke test boots `layout\node\node.exe layout\app\boot.mjs` with `PLAYWRIGHT_BROWSERS_PATH=layout\chromium`.

- [ ] **Step 8: Optional full installer.** With `-FullInstaller`: ISCC with `/DAppVersion=<v> /DLayoutDir=<out>\layout /O<out>`, then the `.sha256` file as today.

- [ ] **Step 9: Verify by running it**

Run: `powershell -ExecutionPolicy Bypass -File installer\release.ps1 -NoPublish -FullInstaller`
Expected: green, summary table printed, `<Root>\out\<v>\` holds five zips (four if Alloy absent), `components.json`, `layout\installed.json`, the setup exe. Run it a **second time** unchanged: `chromium`, `node`, `runtime`, `monitoring` report "cache hit", and `npm ci` is skipped. Record both runs' summary tables in the task report.

- [ ] **Step 10: README.** Replace the "Building" section with the release procedure (key setup, `release.ps1` flags, first-run vs cached timings, where output lands). Note OneDrive is why the build root is elsewhere.

- [ ] **Step 11: Commit** `installer/release.ps1 installer/build-package.ps1 installer/buybox.iss installer/README-build.md` — "Release build: outside OneDrive, cached components, timed steps".

### Task 4: Publish to GitHub

**Files:**
- Modify: `installer/release.ps1` (publish step)

**Interfaces:**
- Consumes: Task 2 CLI; `gh` authenticated as `bozomemo`.
- Produces: GitHub Release `v<version>` on `bozomemo/buybox-releases`, marked latest, assets = `update.json`, `update.json.sig`, files listed in `new-assets.txt`; tag `v<version>` pushed to `origin` of the source repo at `-Ref`.

- [ ] **Step 1:** Unless `-NoPublish`: download the current latest `update.json` with `gh release download --repo bozomemo/buybox-releases --pattern update.json` (none → `--previous none`); run `sign-manifest.mjs` with `--base-url https://github.com/bozomemo/buybox-releases/releases/download/v<version>` and `--key $env:USERPROFILE\.buybox\release-signing-key.pem`; `gh release create v<version> --repo bozomemo/buybox-releases --latest --title <version> --notes-file <notes>` with the three file sets; then `git tag v<version> <ref>` and `git push origin v<version>`.
- [ ] **Step 2:** Refuse to publish when the version's release already exists, when `-SkipTests` or `-SkipSmokeTest` was passed, or when `-NotesFile` is missing.
- [ ] **Step 3: Verify against a scratch repo.** Add `-ReleasesRepo` (default `bozomemo/buybox-releases`). **Ask the user before creating any repository** — it is outward-facing. With approval, `gh repo create bozomemo/buybox-releases-test --public`, run `release.ps1 -ReleasesRepo bozomemo/buybox-releases-test -SkipTagPush`, and check `curl -sIL https://github.com/bozomemo/buybox-releases-test/releases/latest/download/update.json` ends in `200` and a second publish reuses the chromium URL from the first. Delete the scratch repo afterwards only if the user says so. The real repo is created in Task 10's rehearsal.
- [ ] **Step 4: Commit** `installer/release.ps1` — "Publish releases to bozomemo/buybox-releases".

---

## Phase B — Self-update

### Task 5: Update file store and the check

**Files:**
- Create: `packages/jobs/src/update/update-files.ts`
- Create: `packages/jobs/src/update/check-for-update.ts`
- Create: `packages/jobs/src/update/index.ts`; Modify: `packages/jobs/src/index.ts` (re-export)
- Create: `packages/jobs/src/update/fixtures/` (manifest fixture builder in test helpers — signatures made at test time)
- Test: `packages/jobs/src/update/check-for-update.test.ts`, `packages/jobs/src/update/update-files.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `updatePaths(dataDir: string): { dir; state; request; status; hold; lock; logs; versionDir(v: string): string }` — all under `<dataDir>\updates`
  - `type UpdateCheckResult = 'up-to-date' | 'ready' | 'signature-missing' | 'signature-invalid' | 'manifest-invalid' | 'download-failed' | 'network-error' | 'disabled'`
  - `interface UpdateState { lastCheckAt: string | null; lastResult: UpdateCheckResult; lastError: string | null; ready: { version: string; notes: string; downloadBytes: number; components: ComponentName[] } | null }`
  - `interface UpdateStatus { phase: 'idle' | 'running' | 'succeeded' | 'rolled-back' | 'aborted' | 'manual-intervention-required'; step: string | null; history: { at: string; from: string; to: string; outcome: string; reason: string | null }[] }` (written by Task 8; read here)
  - `interface UpdateRequest { version: string; requestedBy: string; requestedAt: string }`
  - `readJsonFile<T>(path, schema): T | undefined` (missing or unparseable → `undefined`), `writeJsonFileAtomic(path, value)` (write `<path>.tmp-<rand>` then rename)
  - `checkForUpdate(deps: { dataDir: string; installDir: string; currentVersion: string; manifestUrl: string; publicKeysPem: readonly string[]; fetch: typeof fetch; now: () => Date }): Promise<UpdateState>` — implements spec §5.1 steps 1–6, writes and returns `state.json`. `manifestUrl === ''` → `disabled`. Reads `installed.json` from `installDir`. Downloads stream to `<versionDir>\<name>.zip.part`, hashed with `createHash('sha256')` while streaming, renamed on match. Deletes other version directories under `updates\` on `ready`. Sends header `User-Agent: BuyBox/<currentVersion> update-check` and nothing else identifying.

- [ ] **Step 1: Failing tests** with a fake `fetch` serving `Map<url, Buffer | status>` and a temp dir:
  - newer signed manifest, installed differs only in `app` → `ready`, only `app.zip` exists in `updates\0.2.1\`, `update.json` + `.sig` copied there, `downloadBytes` = app size.
  - same version → `up-to-date`, nothing downloaded.
  - lower version → `up-to-date` (never downgrade).
  - `.sig` 404 → `signature-missing`; tampered manifest → `signature-invalid`; schema-invalid but signed → `manifest-invalid`.
  - zip bytes not matching sha256 → `download-failed`, no `.zip` and no `.part` left.
  - fetch throws → `network-error`, `lastError` set, previous `ready` preserved.
  - manifest body > 64 KB → `manifest-invalid`.
  - `manifestUrl: ''` → `disabled`, `fetch` never called.
  - the `User-Agent` header equals `BuyBox/0.2.0 update-check` on every call.
  - `update-files`: atomic write leaves no `.tmp-*`; reading a corrupt file → `undefined`.
- [ ] **Step 2: Run** `npm test --workspace=packages/jobs -- update` → FAIL.
- [ ] **Step 3: Implement.** Keep pure decisions (version compare, diff, schema) in Task 1's functions; this file is orchestration only.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Wire into the worker** (`apps/worker/src/index.ts`): when both `BUYBOX_DATA_DIR` and `BUYBOX_INSTALL_DIR` are set, start a ticker independent of `Scheduler` (first run 60 s after boot, then every `parseDuration(UPDATE_CHECK_INTERVAL ?? '6h')` from `packages/shared/src/duration.ts`), errors logged as `update.checkFailed`, never thrown. Comment why it is not a scheduler job: the scheduler stops for pause and licence, this must not. Add a worker test that the ticker is not started when `BUYBOX_INSTALL_DIR` is unset.
- [ ] **Step 6: Template env.** `installer/BuyBoxApp.xml.template`: add `<env name="BUYBOX_INSTALL_DIR" value="{{INSTALL_DIR}}" />` beside `BUYBOX_DATA_DIR`.
- [ ] **Step 7: Run** `npm test --workspace=packages/jobs` and `npm test --workspace=apps/worker` → PASS.
- [ ] **Step 8: Commit** the files above — "Check for, verify and download updates outside the scheduler".

### Task 6: Update API

**Files:**
- Create: `apps/web/src/app/api/update/route.ts` (GET)
- Create: `apps/web/src/app/api/update/check/route.ts` (POST)
- Create: `apps/web/src/app/api/update/apply/route.ts` (POST)
- Create: `apps/web/src/lib/server/update.ts`
- Test: `apps/web/src/app/api/update/route.test.ts`, `apps/web/src/app/api/update/apply/route.test.ts`
- Modify: `apps/web/src/app/api/route-guard.test.ts` if it enumerates routes

**Interfaces:**
- Consumes: Task 5 (`updatePaths`, `readJsonFile`, `writeJsonFileAtomic`, `checkForUpdate`, types); `withPermission` from `@/lib/server/auth/guard`.
- Produces:
  - `GET /api/update` (`settings.manage`) → `{ available: boolean; currentVersion: string | null; state: UpdateState | null; status: UpdateStatus | null; inProgress: boolean }`. `available: false` when `BUYBOX_DATA_DIR`/`BUYBOX_INSTALL_DIR` unset. `inProgress` = `lock` exists or `request.json` exists.
  - `POST /api/update/check` (`settings.manage`) → runs `checkForUpdate`, returns the new `UpdateState`.
  - `POST /api/update/apply` (`settings.manage`, body `{ version: string }`) → 409 `{ error }` when not `available`, no `ready`, `version !== ready.version`, or `inProgress`; else writes `request.json` (`requestedBy` = `auth.actor`) and calls `runUpdaterTask()`; 202 `{ started: true }`. If `runUpdaterTask` fails, deletes `request.json` and returns 500 with its message.
  - `lib/server/update.ts`: `updateEnv(): { dataDir: string; installDir: string } | undefined`; `runUpdaterTask(): Promise<void>` — `execFile('schtasks', ['/run', '/tn', 'BuyBoxUpdater'])`, injectable for tests via a module-level setter used only by tests, following whatever injection pattern neighbouring `lib/server` modules use.
- The update routes stay behind the licence gate's normal rules **except** they must be reachable while unlicensed: add `/api/update` and `/settings/update` to `LICENSE_EXEMPT_PREFIXES` in `apps/web/src/proxy.ts` with a comment citing spec §5.1 (an expired install must be updatable). Sign-in is still required.

- [ ] **Step 1: Failing tests** (use `test-auth.ts` helpers as other route tests do): viewer and price_manager → 403 on all three; admin GET with env unset → `available: false`; apply with no ready → 409; apply with mismatched version → 409; apply while `lock` exists → 409; second apply after a successful first (request.json present) → 409; success writes `request.json` with `requestedBy` and calls the runner once; runner failure → 500 and `request.json` removed; proxy test: `/api/update` reachable unlicensed but not signed-out.
- [ ] **Step 2: Run** `npm test --workspace=apps/web -- api/update` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** — "Update API: status, check now, install".

### Task 7: Pricing hold and `verify-update.mjs`

**Files:**
- Modify: `packages/jobs/src/scheduler.ts` (`SchedulerOptions.isUpdateHeld?: () => boolean`; tick outcome `'update-hold'`; `TickResult.updateHeld: boolean`)
- Modify: `apps/worker/src/index.ts` (pass `() => existsSync(updatePaths(dataDir).hold)` when data dir is set)
- Modify: `apps/web/src/app/api/health/route.ts` (add `updateHold: boolean` to the body; never affects `status`)
- Modify: `apps/web/src/app/jobs/jobs-client.tsx` (`SchedulerBanner`: `lastTickOutcome === 'update-hold'` → "Güncelleme doğrulanıyor — fiyat işleri duraklatıldı.")
- Modify: `apps/web/src/lib/server/worker-status.ts` (outcome doc comment)
- Create: `scripts/verify-update.mjs`, `scripts/build-verify-update.mjs`
- Create: `packages/jobs/src/update/verify-downloaded.ts`
- Modify: `installer/release.ps1` (bundle `verify-update.mjs` into `app\` beside `admin.mjs`)
- Test: `packages/jobs/src/scheduler.test.ts`, `packages/jobs/src/update/verify-downloaded.test.ts`, `apps/web/src/app/jobs/jobs-client.test.tsx` (or the existing banner test file), health route test

**Interfaces:**
- Consumes: Task 1, Task 5.
- Produces:
  - Scheduler: hold is checked **before** `isSystemPaused`; while held, nothing is enqueued or claimed, outcome `'update-hold'`.
  - `verifyDownloadedRelease(versionDir: string, publicKeysPem: readonly string[]): { ok: true; manifest: UpdateManifest; zips: ComponentName[] } | { ok: false; reason: string }` — verifies `update.json.sig`, parses, and for every `<name>.zip` present checks size and sha256 against the manifest; a zip not in the manifest → not ok.
  - `node verify-update.mjs <versionDir>` → prints JSON `{ ok, reason?, version?, zips? }` on stdout, exit 0 when ok, 1 otherwise. Bundled with esbuild exactly as `scripts/build-admin-cli.mjs` bundles `admin.mjs`.

- [ ] **Step 1: Failing tests:** scheduler with `isUpdateHeld: () => true` and pause disengaged → nothing claimed, outcome `update-hold`; without the option → behaviour unchanged (existing tests stay green); `verifyDownloadedRelease` table: good dir → ok; altered zip byte → not ok `sha256 mismatch: app`; extra `foo.zip` → not ok; bad sig → not ok; banner text shown for `update-hold`; health body has `updateHold: true` and `status: 'ok'` with a hold file and healthy DB.
- [ ] **Step 2: Run** the three workspaces' tests → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Bundle once: `node scripts/build-verify-update.mjs <scratch>\verify-update.mjs` and run it against a dir produced by Task 5's test fixture writer → exit 0.
- [ ] **Step 5: Commit** — "Hold pricing during an update; standalone release verifier".

### Task 8: `apply-update.ps1`

**Files:**
- Create: `installer/apply-update.ps1`
- Create: `installer/register-updater-task.ps1`
- Modify: `installer/release.ps1` (add both to the runtime scripts array)

**Interfaces:**
- Consumes: `request.json`, `updates\<v>\` (Task 5), `app\verify-update.mjs` (Task 7), `install-service.ps1`, `stop-service.ps1`, `/api/health` (`status`, `version`, `worker.running`, `worker.databaseTarget`, `worker.configuredDatabase`, `database.schema.applied`), `.env.local` `DATABASE_URL`.
- Produces: `status.json` (`UpdateStatus` shape from Task 5) updated at every step; `updates\logs\<from>-<to>-<yyyyMMddHHmmss>.log`; Event Log source `BuyBoxUpdater` (Application log); `installed.json` on success.
- `register-updater-task.ps1 -InstallDir -DataDir`: (re)creates task `BuyBoxUpdater`, principal SYSTEM, highest privileges, no trigger, action:
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Copy-Item '<InstallDir>\scripts\apply-update.ps1' '<DataDir>\updates\apply-update.ps1' -Force; & '<DataDir>\updates\apply-update.ps1' -InstallDir '<InstallDir>' -DataDir '<DataDir>'"`
  so the running script is never inside a directory it replaces. Use `Register-ScheduledTask` with `-Force`.

Steps of the script follow spec §6 exactly; the decisions the spec leaves open are pinned here:

- [ ] **Step 1: Skeleton and guards.** `param(InstallDir, DataDir, Port = port read from the existing service XML's PORT env)`. ASCII only. Create `lock` with `[IO.File]::Open(…, CreateNew)`; if it exists and is younger than 30 min, exit; older → take over and log it. Read `request.json`; missing → exit. `finally`: delete `lock` and `request.json`.
- [ ] **Step 2: Clean leftovers.** Delete any `{app}\*.new` and `{app}\*.failed` before starting.
- [ ] **Step 3: Verify** with `& "$InstallDir\node\node.exe" "$InstallDir\app\verify-update.mjs" <versionDir>`; parse stdout JSON; the manifest's `version` must equal `request.version`.
- [ ] **Step 4: Disk and extract.** Free space on the install volume ≥ 3 × total zip size. For each zip: `tar.exe -x -f <zip> -C <scratch>` into `updates\<v>\extract\<name>\`, then move each top-level dir `X` to `{app}\X.new`.
- [ ] **Step 5: Pre-stop facts.** GET `/api/health` → remember `database.schema.applied` and the dialect.
- [ ] **Step 6: Hold, stop, back up.** Write `hold`; run `stop-service.ps1` logic (call it); back up per spec §6 step 7: parse `DATABASE_URL` from `<DataDir>\.env.local`; Postgres → `pg_dump --dbname=<url> -Fc -f <DataDir>\backups\pre-update-<from>-<to>.dump`, `pg_dump.exe` located via `PG_BIN_DIR` env, then `HKLM:\SOFTWARE\PostgreSQL\Installations\*` `Base Directory`\bin, then `Get-Command`; SQLite → `Copy-Item` the db file (and `-wal` if present) to `backups\pre-update-<from>-<to>.db`. Keep newest 5 `pre-update-*`. Failure → **abort** path.
- [ ] **Step 7: Swap.** For each `X.new`: delete `X.previous`, rename `X` → `X.previous`, `X.new` → `X`. If `service` was swapped, copy `service.previous\BuyBoxApp.xml` into the new `service\` **before** step 8 (Review Focus 4).
- [ ] **Step 8: Start and gate.** Run `install-service.ps1 -InstallDir -DataDir -Port -Version <to>` (it re-renders the XML carrying `PUBLIC_ORIGIN`/`TRUST_PROXY`, refreshes, starts). Poll `/api/health` every 3 s for 180 s until `status = ok`, `version = <to>`, `worker.running`, `worker.databaseTarget = worker.configuredDatabase`.
- [ ] **Step 9: Success path** per spec §6 (delete `hold`, merge manifest components into `installed.json` with `version = <to>`, `monitoring` → `install-monitoring.ps1` non-fatal, delete `updates\<v>\`, history entry `succeeded`).
- [ ] **Step 10: Rollback path** per spec §6: copy last 200 lines of `<DataDir>\logs\BuyBoxApp.err.log` into the run log; stop; for each swapped `X`: `X` → `X.failed`, `X.previous` → `X`; if the new version's health was ever read with `schema.applied` greater than the step-5 value, **or** health never answered (unknown → restore, the safe side), restore: Postgres `pg_restore --clean --if-exists --dbname=<url> <dump>`, SQLite copy back; `install-service.ps1 … -Version <from>`; same gate against `<from>`; ok → delete `hold`, `rolled-back: <reason>`; not ok → keep `hold`, Event Log error, `manual-intervention-required`.
- [ ] **Step 11: Abort path:** remove `*.new`, start the service if it was stopped (`install-service.ps1 -Version <from>`), delete `hold`, `aborted: <reason>`.
- [ ] **Step 12: Parse check.** Run `powershell -NoProfile -Command "[void][System.Management.Automation.Language.Parser]::ParseFile('installer\apply-update.ps1',[ref]$null,[ref]$e); $e"` for both scripts → no errors; and the ASCII check from `release.ps1`.
- [ ] **Step 13: Commit** the three files — "apply-update.ps1: swap, back up, verify, roll back".

### Task 9: UI and installer integration

**Files:**
- Create: `apps/web/src/app/settings/update/page.tsx`, `apps/web/src/app/settings/update/update-client.tsx`
- Test: `apps/web/src/app/settings/update/update-client.test.tsx`
- Modify: `apps/web/src/app/settings/settings-tabs.tsx` (tab `{ href: '/settings/update', label: 'Güncelleme' }`, shown only with `can('settings.manage')`, same filter style as Kullanıcılar)
- Modify: `apps/web/src/app/nav-shell.tsx` (notice "Yeni sürüm <v> hazır" linking to `/settings/update`, only for `settings.manage`, from `GET /api/update`, polled on the same cadence the shell already uses for its status reads)
- Modify: `apps/web/src/lib/labels.ts` (outcome labels: `succeeded` Başarılı, `rolled-back` Geri dönüldü, `aborted` İptal edildi, `manual-intervention-required` Elle müdahale gerekli; check results in Turkish)
- Modify: `installer/buybox.iss` (`CurStepChanged`: after `install-service.ps1`, `RunStep('register-updater-task.ps1', …)`; `[InstallDelete]` for `{app}\*.previous`, `{app}\*.new`, `{app}\*.failed`; uninstall removes the task)
- Modify: `installer/uninstall-service.ps1` (`Unregister-ScheduledTask BuyBoxUpdater -Confirm:$false`, ignore if absent)

**Interfaces:**
- Consumes: Task 6 API; kit components the other settings pages use (follow `apps/web/src/app/kit-adoption.test.ts`'s rules).
- Page behaviour: running version; last check time + result label; ready block (version, notes, size in MB, **Şimdi kur**); **Şimdi kontrol et**; history table; `available: false` → single line "Bu kurulumda otomatik güncelleme yok." and nothing else. **Şimdi kur** opens a confirm dialog with exactly: "Servis 2–3 dakika duracak. Fiyat işleri yeni sürüm doğrulanana kadar duraklatılmış kalacak." After 202: "Kuruluyor…", poll `/api/health` every 3 s (network errors expected while the service is down), then reload `GET /api/update` and show the latest history entry.

- [ ] **Step 1: Failing tests:** unavailable → only the one line; ready → button visible with version and size; confirm → POST body `{ version }`; 409 → error message shown, no "Kuruluyor"; history renders Turkish outcome labels; tab hidden for price_manager; `kit-adoption.test.ts` passes.
- [ ] **Step 2: Run** `npm test --workspace=apps/web -- settings/update` → FAIL.
- [ ] **Step 3: Implement** page, tab, nav notice, labels.
- [ ] **Step 4: Run** `npm test --workspace=apps/web` → PASS.
- [ ] **Step 5: Installer.** Edit `buybox.iss` and `uninstall-service.ps1` as listed; build with `release.ps1 -NoPublish -FullInstaller`; the run must be green.
- [ ] **Step 6: Commit** — "Settings > Güncelleme, nav notice, updater task in the installer".

### Task 10: Documents, version 0.2.0, rehearsal

**Files:**
- Modify: `docs/14-deployment.md` (§8 new pipeline; §12 rewritten: "Decided 2026-11-04: built" + link to the spec, keep the departures from spec §9; §10 add U-1…U-7 verbatim from spec §11)
- Modify: `docs/08-configuration-and-constants.md` (spec §10 table)
- Modify: `docs/11-rewrite-requirements.md` §9b (acceptance: update found, verified, installed on one click; failed health → code + DB rolled back; pricing held throughout)
- Modify: `package.json` version → `0.2.0`

- [ ] **Step 1:** Write the doc changes; bump the version.
- [ ] **Step 2: Full verification** on this machine: `npm run typecheck`, `npm test` (DB suite with `--no-file-parallelism` per project memory), `npm run lint` → all green. Paste the summaries.
- [ ] **Step 3: Commit** — "0.2.0: self-update documented".
- [ ] **Step 4: Rehearsal (with the user, on a Windows VM or spare machine — not production):**
  1. `release.ps1 -FullInstaller` for 0.2.0 → publish (ask the user before `gh repo create bozomemo/buybox-releases --public`) → install 0.2.0 on the VM with the setup exe.
  2. Bump to 0.2.1 (a visible text change), `release.ps1` → publish → on the VM: wait for or press "Şimdi kontrol et", confirm only `app` downloaded (U-7), "Şimdi kur" → U-1 passes.
  3. U-2: release 0.2.2 whose migration adds a table and whose `boot.mjs` exits after migrating → rollback, table gone, 0.2.1 healthy, history `Geri dönüldü`.
  4. U-3 (rename `pg_dump.exe` / point `PG_BIN_DIR` nowhere), U-4 (alter a downloaded zip before clicking), U-5 (set `PUBLIC_ORIGIN` in the XML before updating), U-6 (disconnect network, check) — each with its expected outcome from spec §11.
  5. Record results in doc 14 §10 and in project memory.
- [ ] **Step 5:** Only after U-1 and U-2 pass: hand the user the 0.2.0 setup exe for the one manual production install (spec §8), reminding them that production's `PUBLIC_ORIGIN`/`TRUST_PROXY` are carried by `install-service.ps1`.
