# Fast component builds and one-click self-update — design

Date: 2026-11-04. Status: approved in conversation with the product owner, pending spec review.

Supersedes the "deferred" decision of `docs/14-deployment.md` §12 (2026-08-24). That section's
reasoning is kept where it still applies and departed from, explicitly, where noted below.

## 1. Problem

1. **Building the installer takes hours.** Measured and observed causes:
   - The repository lives under OneDrive. Every build writes ~1.1 GB of staging (tens of
     thousands of small files) and a ~385 MB `.exe` into a synced folder; `installer/out` alone
     holds 7.1 GB. Sync and on-access scanning of small files are the likely dominant cost.
   - ~900 MB of the package never changes between releases (Chromium 703 MB, Alloy 105 MB,
     `node.exe` 92 MB) yet is re-copied and re-compressed every build. Only `app\` (113 MB)
     changes.
   - `lzma2/max` solid compression of the whole tree: 221 s (0.1.22 log).
   - The full test suite runs every build; its duration was never logged, so its share is
     unknown. Step timings are part of this design so the next decision is made on numbers.
2. **Updating is manual.** The vendor builds a 385 MB installer, copies it to the customer's
   server over RDP, and runs it.

## 2. Decisions (product owner, 2026-11-04)

| # | Question | Decision |
|---|---|---|
| D1 | How is an update installed? | **Downloaded automatically, installed on one click** by an admin, with **automatic rollback** if the new version is unhealthy. Never silent. |
| D2 | Where are updates hosted? | A **separate public GitHub repository**, `bozomemo/buybox-releases`, holding only signed manifests and component archives — no source. The manifest URL is configurable so a later move to R2/S3 is a configuration change. |
| D3 | Granularity of "only what changed" | **Per component** (§4.1). Not per file. |
| D4 | Where does the build run? | **The vendor's own Windows machine, outside OneDrive.** The signing key never leaves it. GitHub Actions is a later option the script must not preclude. |
| D5 | Rollback and the database | **Back up before every update** (`pg_dump` / SQLite file copy). The new version starts with **pricing held** until it passes health. On rollback, if the new version applied migrations, the **database is restored** from that backup. |

Assumed, not asked: the release build keeps running typecheck, the full test suite, the ABI
check and the smoke test. Steps are timed; whether tests move out of the build is decided later
on those timings. **Decided 2026-11-05 on those timings:** release builds skip the MySQL tier of
the DB suite (SQLite + PostgreSQL only; CI keeps all three), and the build runs on a pinned,
downloaded Node 22 LTS rather than the machine's `PATH` Node.

## 3. Architecture

Three units, each with one job:

| Unit | Runs where | Job |
|---|---|---|
| `installer/release.ps1` | vendor machine | Build, produce components, sign the manifest, publish a GitHub Release. |
| `CheckForUpdate` job + `/settings/update` | the app (worker + web) | Find, verify and download a newer release; show it; request installation. |
| `apply-update.ps1` | customer server, as SYSTEM via scheduled task `BuyBoxUpdater` | Swap components, back up, restart, verify, roll back. |

The app cannot replace its own files while running, which is why installation is a separate
process. The app and the updater communicate only through files under
`C:\ProgramData\BuyBox\updates\`, because the updater is PowerShell and does not open the
database.

```
ProgramData\BuyBox\updates\
  state.json            written by the app: last check, ready version, downloaded components
  request.json          written by the app on "Şimdi kur": { version, requestedBy, requestedAt }
  status.json           written by the updater: current step, last result, history (last 20)
  hold                  present = pricing held (§5.2)
  lock                  updater single-instance lock
  <version>\            downloaded, verified component archives + update.json + update.json.sig
  logs\                 one log per update run
Program Files\BuyBox\
  installed.json        { version, components: { name: { version, sha256 } } }
  app\ node\ chromium\ runtime parts…   live components
  <name>.previous\      the component replaced by the last update, kept until the next one
```

## 4. Build pipeline (`installer/release.ps1`)

Replaces `build-package.ps1` as the release entry point. `build-package.ps1`'s checks (developer
state purge and assertion, Playwright overlay, migrations copy, ABI check, ASCII-only scripts,
smoke test) move into it unchanged in substance.

1. **Clean checkout outside OneDrive.** `BUYBOX_BUILD_ROOT` (default `C:\BuyBoxBuild`). The
   release commit is checked out as a `git worktree` at `<root>\src`; `npm ci` runs there.
   `node_modules` is restored from `<root>\cache\node_modules-<lockfile sha256>` when the
   lockfile is unchanged. Staging and output also live under `<root>`. Building from the
   committed tree removes the `.env.local` / `app.db` leak class at its source; the forbidden-
   state assertion stays as a second line.
   The script refuses to run if the working tree it is asked to release is dirty or the commit
   is not tagged `v<version>`.
2. **Timed steps.** Every step logs its duration (`-- test 14m32s`) and the log ends with a
   summary table. The log is written to `<root>\out\`, not to the repository.
3. **Components and the cache.** Each component is a zip whose cache key is derived from its
   inputs; a cache hit reuses the zip and its sha256 without touching the files:

   | Component | Contents | Cache key |
   |---|---|---|
   | `app` | standalone server, `.next\static`, `public`, `boot.mjs`, `admin.mjs`, `migrations\`, `verify-update.mjs` | none — always rebuilt |
   | `node` | `node.exe` | `node --version` |
   | `chromium` | Playwright's Chromium | installed `playwright-core` version |
   | `runtime` | `scripts\` (incl. `apply-update.ps1`), `service\` (WinSW + XML template) | sha256 of the input files |
   | `monitoring` | Alloy installer + config template | sha256 of the inputs |

   Zips use normal (deflate) compression; speed matters more than the last 10 %.
4. **Smoke test on the extracted components.** The components are extracted into a scratch
   install layout and booted exactly as today's smoke test boots staging, so what is tested is
   what is shipped.
5. **Manifest.** `update.json`:

   ```json
   {
     "schema": 1,
     "version": "0.2.1",
     "releasedAt": "2026-11-10T12:00:00Z",
     "notes": "Kısa Türkçe sürüm notları",
     "components": {
       "app":      { "version": "0.2.1",   "sha256": "…", "size": 31457280,  "url": "https://github.com/bozomemo/buybox-releases/releases/download/v0.2.1/app-0.2.1.zip" },
       "chromium": { "version": "pw-1.49", "sha256": "…", "size": 290000000, "url": "https://github.com/bozomemo/buybox-releases/releases/download/v0.2.0/chromium-pw-1.49.zip" }
     }
   }
   ```

   A component that did not change points at the release that first published it, so large
   unchanged archives are uploaded once. `update.json.sig` is a detached Ed25519 signature over
   the exact bytes of `update.json`, made with the release key (§7).
6. **Publish.** `gh release create v<version>` on `bozomemo/buybox-releases` with `update.json`,
   `update.json.sig` and only the newly built component zips. The release is marked latest, so
   `https://github.com/bozomemo/buybox-releases/releases/latest/download/update.json` resolves to
   it. `-NoPublish` stops before this step.
7. **Full installer is optional** (`-FullInstaller`). Inno Setup packs the same extracted
   components and is needed only for a new installation or the one-time migration (§8). A normal
   release skips it, and with it the 221 s compression.

## 5. The app side

### 5.1 `CheckForUpdate` job

- Runs every `UPDATE_CHECK_INTERVAL` (default 6 h) and on demand from `/settings/update`.
- **Outside the pricing path.** A failure is recorded in `state.json` and the run ends; nothing
  else waits on it.
- **Exempt from the licence gate**, so an expired install can still be updated. **Sends no
  licence id** and nothing identifying the customer. User agent `BuyBox/<version> update-check`.
- Steps:
  1. Fetch `UPDATE_MANIFEST_URL` and `<same>.sig` (redirects followed, size limit 64 KB).
  2. Verify the signature against any key in the embedded release-key list. Invalid → recorded
     as `signature-invalid`, stop.
  3. Parse with a strict schema. `version` not greater than the running `APP_VERSION` → stop
     (never downgrade).
  4. Diff against `installed.json`: a component is needed when its `sha256` differs.
  5. Download each needed component into `updates\<version>\` (streamed to a `.part` file,
     sha256 computed while streaming, renamed on match, deleted on mismatch). No resume; a
     failed download is retried from zero on the next check.
  6. Write `state.json` as `ready` with version, notes and total downloaded size. Delete other
     version directories.
- Pure parts (manifest schema, signature check, version compare, component diff, state
  transitions) live in a pure module with no I/O, so they are table-tested; the job is a thin
  shell around them.

### 5.2 Pricing hold

`isKillSwitchEngaged` is extended so the existence of `updates\hold` engages it, whatever the
database says. The caller does the file check and passes the result in; the shared function
stays pure. Fail-closed, like the existing pause. The Jobs screen and Panel name the reason:
"Güncelleme doğrulanıyor — fiyat işleri duraklatıldı."

`/api/health` must still report `status: ok` while held, because the updater's health gate
(§6) runs while held. Health does not consult the pause today (verified 2026-11-04); the hold is
added to the health body as `updateHold: true` for information only and never degrades status.

### 5.3 UI — admin role only

- Nav notice when `state.json` is `ready`: "Yeni sürüm <v> hazır" → `/settings/update`.
- `/settings/update`: running version; last check time and result; ready version, notes and
  download size; **Şimdi kur**; **Şimdi kontrol et**; history from `status.json`
  (başarılı / geri dönüldü / iptal / elle müdahale gerekli) with the reason.
- **Şimdi kur** confirms: "Servis 2–3 dakika duracak. Fiyat işleri yeni sürüm doğrulanana kadar
  duraklatılmış kalacak." Then `POST /api/update/apply` (admin; network-mode Origin check as for
  every other mutation) writes `request.json` and runs `schtasks /run /tn BuyBoxUpdater`. The
  page shows "Kuruluyor…", polls `/api/health` until the service answers again, then shows the
  result from `status.json`.
- The route refuses when nothing is `ready`, when `lock` exists, or when the requested version
  is not the ready one.

## 6. The updater (`apply-update.ps1`)

The scheduled task runs a launcher that copies `apply-update.ps1` from `{app}\scripts\` to
`updates\` and runs that copy, so the script is never inside a directory it replaces. ASCII-only
(doc 14 §8.4). Every step is logged to `updates\logs\` and to the Windows Event Log, and
`status.json` is updated at each step so the UI can say where it stopped.

**While the old service still runs:**
1. Take `lock`; read `request.json`.
2. Re-verify the manifest signature and every archive's sha256 with the installed `node.exe`
   running the **installed** `app\verify-update.mjs` — never a copy from the archive being
   verified. Mismatch → abort.
3. Check free disk space (archives × 3). Extract each changed component to `{app}\<name>.new`.
4. Record the database's applied-migration count.

**Downtime window:**
5. Write `hold`.
6. Stop the service and wait for the process to exit (`stop-service.ps1`).
7. **Back up.** PostgreSQL: `pg_dump -Fc` to `backups\pre-update-<from>-<to>.dump`; `pg_dump`
   is found from `PG_BIN_DIR`, the PostgreSQL uninstall registry key, then `PATH`. SQLite: file
   copy beside the existing pre-migration backups. Keep the last 5. Failure → abort.
8. For each changed component: rename `<name>` → `<name>.previous` (after deleting an older
   `.previous`), then `<name>.new` → `<name>`.
9. Re-render the service XML with `install-service.ps1`'s logic, preserving `PUBLIC_ORIGIN` and
   `TRUST_PROXY` (doc 14 §13.7) and setting the new `APP_VERSION`.
10. Start the service. Wait up to 180 s for `/api/health` with `status: ok`, worker running,
    `version` equal to the new version, and worker and web on the same database.

**Success:** delete `hold`; write `installed.json`; `status.json` → `succeeded`; if `monitoring`
changed, run `install-monitoring.ps1` (its failure is a warning, not a failed update); delete the
version directory; release `lock`.

**Abort** (verification, disk or backup failure, before any rename): delete `.new` directories,
start the old service if stopped, delete `hold`, `status.json` → `aborted: <reason>`.

**Rollback** (health gate failed):
1. Save the new version's log tail into the run log; stop the service.
2. Rename `<name>` → `<name>.failed`, `<name>.previous` → `<name>`.
3. If the migration count changed, `pg_restore --clean --if-exists` from the step-7 dump (SQLite:
   copy the backup back). Because of `hold`, the new version submitted no prices, so no
   confirmed-price audit record is lost.
4. Re-render the old XML, start, run the same health gate against the old version.
5. Success → delete `hold`, `status.json` → `rolled-back: <reason>`.

**Rollback failed:** leave `hold` in place (pricing stays stopped — the safe direction), Event Log
error, `status.json` → `manual-intervention-required`. Recovery is re-running the full installer,
as today (doc 14 §5).

## 7. Keys

- `scripts/generate-release-keypair.mjs`, modelled on `generate-license-keypair.mjs`: refuses to
  overwrite, writes the private key to `%USERPROFILE%\.buybox\release-signing-key.pem` — outside
  the repository and outside OneDrive — and prints the public key. The operator backs the private
  key up offline. Losing it means the next release carrying a new key must be installed with the
  full installer.
- The public key is embedded as a **list** in `packages/shared/src/release/public-key.ts`
  (current, plus the next one when rotating), so rotation ships as an ordinary update.
- **Separate from the licence key**, so one leak is not both (doc 14 §12).
- The Ed25519 verify path reuses the primitives in `packages/shared/src/license/`; `release.ps1`
  signs with a small node script.

## 8. One-time migration

The current production install (0.1.22 at most) has no updater. **0.2.0 is installed once by hand
with the full installer.** That installer creates the `BuyBoxUpdater` scheduled task (SYSTEM, on
demand only), writes `installed.json`, ships the release key, and from then on removes leftover
`.new`, `.previous` and `.failed` directories. Every later release arrives through the button.

## 9. Deliberate departures from doc 14 §12

- **Hosting on GitHub Releases.** §12 rejected GitHub because of a token on the customer machine
  (private repo) or publishing a commercial product (public repo). The public releases repo
  holds no source, but the compiled application is downloadable by anyone. Accepted by the
  product owner for now (D2); the manifest URL is configurable for a move to R2/S3.
- **Code signing is not a prerequisite.** §12 required it because a service silently launching an
  unsigned installer exe with elevation looks like malware to EDR. This design launches no
  installer exe: a scheduled task the installer itself created runs the product's own script,
  which unpacks archives verified against a signed manifest; `node.exe` keeps Node's own
  signature. **Accepted risk**; if Defender or an EDR product flags the updater, code signing
  (doc 14 §9) is prioritised.

What §12 required and this design keeps: signed manifest with a separate key; hash-verified
download before anything runs; download automatically, install on one click; outside the pricing
path; no licence id; exempt from the licence gate.

## 10. Configuration (to add to `docs/08-configuration-and-constants.md`)

| Name | Default | Purpose |
|---|---|---|
| `UPDATE_MANIFEST_URL` | `https://github.com/bozomemo/buybox-releases/releases/latest/download/update.json` | Where to look. Empty disables update checks. |
| `UPDATE_CHECK_INTERVAL` | `6h` | Check cadence. |
| `PG_BIN_DIR` | unset | Override for locating `pg_dump`/`pg_restore`. |
| `BUYBOX_BUILD_ROOT` | `C:\BuyBoxBuild` | Vendor side: build root outside OneDrive. |

## 11. Testing

- **Unit (vitest, table-driven, recorded fixtures — no live GitHub):** manifest schema; signature
  valid / tampered / wrong key / rotated key; version comparison incl. equal and lower; component
  diff; download hash mismatch; state transitions; hold engages the kill switch and the UI names
  the reason; `/api/update/apply` is admin-only, refuses when not ready or locked, and writes
  `request.json`.
- **Installation rehearsal on a Windows machine or VM**, added to doc 14 §10 as U-1…U-7:
  - U-1 0.2.0 → 0.2.1 succeeds; only changed components downloaded; prices resume.
  - U-2 a deliberately broken 0.2.2 (fails health after running a migration) → code and database
    rolled back; old version healthy; history says `rolled-back`.
  - U-3 `pg_dump` unavailable → `aborted`, old version running, not held.
  - U-4 a zip altered after download → refused at re-verification.
  - U-5 `PUBLIC_ORIGIN`/`TRUST_PROXY` survive an update.
  - U-6 no network → nothing visible beyond the last-check result.
  - U-7 a release changing only `app` downloads one archive of ~30 MB.
- Production receives its first button update only after U-1 and U-2 pass in rehearsal.

## 12. Out of scope

- Linux/`.deb` self-update (production is Windows).
- Per-file deltas, staged rollout, silent or scheduled installation.
- Moving the build to GitHub Actions.

## 13. Documents to update with the implementation

- `docs/14-deployment.md`: rewrite §12 (decision changed 2026-11-04, pointing here); §8 for the
  new pipeline; §10 for U-1…U-7.
- `docs/08-configuration-and-constants.md`: §10's settings.
- `docs/11-rewrite-requirements.md` §9b: acceptance criteria for update and rollback.
- `installer/README-build.md`: the new release procedure.
