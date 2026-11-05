# Building the Windows installer

The specification is `docs/14-deployment.md`. This file is only the mechanics.

## Why this must run on Windows

`better-sqlite3` is compiled against a specific Node ABI. A package that pairs a Linux-built
`node_modules` with a Windows `node.exe` fails at the customer's first request, not in CI
(doc 14 §3.1). `build-package.ps1` asserts the pairing by actually loading the driver under the
bundled runtime before it packs anything — but it can only do that if `npm ci` ran on the same
machine, under the same Node major version.

## One-time setup

| Need | How |
|---|---|
| Node (any) | Only to run `npm`/`git` tooling yourself. The release build does **not** use the Node on your `PATH`: `release.ps1` downloads the pinned Node 22 LTS portable zip (`$pinnedNodeVersion`, hash-checked) into `<root>\cache\node-runtime` and puts it first on `PATH` for its own process only — nothing is installed. To move to a newer 22.x, change `$pinnedNodeVersion` and `$pinnedNodeZipSha256` from `https://nodejs.org/dist/<ver>/SHASUMS256.txt`. |
| Docker Desktop | For the PostgreSQL test container. Release builds run the DB suite on SQLite + PostgreSQL only; MySQL is skipped (`BUYBOX_TEST_DIALECTS`, owner decision 2026-11-05) and stays covered by CI. |
| Inno Setup 6 | `winget install JRSoftware.InnoSetup`. Winget installs it per-user under `%LOCALAPPDATA%\Programs`; the build script finds it there, in Program Files, or via the uninstall registry, so you do not have to place it anywhere particular. |
| WinSW | Download `WinSW-x64.exe` from `https://github.com/winsw/winsw/releases`, verify its SHA-256 against the release page, and save it as `installer\vendor\WinSW.exe`. |

WinSW is **vendored deliberately**, not downloaded during a build: what runs on a customer's
machine as a service should be a binary we chose and checked once, not whatever a URL served on
build day.

## Building

The build is `installer\release.ps1` (spec `docs/superpowers/specs/2026-11-04-auto-update-design.md`
§4). It builds **outside the repository** — `C:\BuyBoxBuild` by default, `BUYBOX_BUILD_ROOT` to
move it — from a clean `git worktree` of a commit. The repository lives under OneDrive, and the
old build wrote ~1.1 GB of small files and a 385 MB installer into the synced folder on every
run; that, plus re-processing ~900 MB that never changes, is why builds took hours.

```powershell
# a release, published to GitHub (needs a clean, committed tree)
powershell -ExecutionPolicy Bypass -File installer\release.ps1 -NotesFile notes-0.2.1.txt

# build only, plus the full installer for a new install
powershell -ExecutionPolicy Bypass -File installer\release.ps1 -NoPublish -FullInstaller

# build a specific commit regardless of local edits
powershell -ExecutionPolicy Bypass -File installer\release.ps1 -NoPublish -Ref <commit>
```

`installer\build-package.ps1` still works: it is `release.ps1 -NoPublish -FullInstaller`.

Output lands in `<root>\out\<version>\`: one zip per component, `components.json`, `layout\`
(the exact install tree, with `installed.json`), the build log, and with `-FullInstaller`
`BuyBoxSetup-<version>.exe` + `.sha256`.

**What is cached.** Each component is a zip cached under `<root>\cache\components\` by a key
derived from its inputs; a hit reuses it untouched and the log says `cache hit`:

| Component | Contents | Rebuilt when |
|---|---|---|
| `app` | standalone server, static, public, `boot.mjs`, `admin.mjs`, `verify-update.mjs`, migrations | every release |
| `node` | `node.exe` | `$pinnedNodeVersion` in `release.ps1` changes |
| `chromium` | Playwright's Chromium | `playwright-core` changes |
| `runtime` | `scripts\`, `service\` (WinSW + XML template) | any of those files changes |
| `monitoring` | Alloy installer + config template | either changes |

`node_modules` is kept between builds too, keyed by `package-lock.json` and the Node version.

**Every step is timed** and the log ends with a table. Look there before guessing where time goes.

**Prerequisites beyond the one-time setup above:** Docker Desktop running (the test step starts and
stops `packages/db/docker-compose.test.yml`), and for publishing, `gh auth login` and the release
signing key at `%USERPROFILE%\.buybox\release-signing-key.pem` (`node scripts/generate-release-keypair.mjs`,
once; **back it up offline** — installs only trust the keys compiled into them).

A publish is refused before anything is built when `-SkipTests` or `-SkipSmokeTest` is passed,
when `-NotesFile` is missing, or when the key or `gh` is not ready.

**Do not pass `-SkipSmokeTest` for anything you intend to ship.** The smoke test boots the
assembled package the way the service boots it, against a throwaway data directory, and requires
`/api/health` to report `status: ok`. It is the only step that exercises the *package* rather
than the repository, and the two packaging bugs that reached a real install (doc 14 §8.2) were
invisible to everything else — typecheck, the full test suite and the ABI assertion were all
green while every request returned 500. The switch exists for iterating on the Inno Setup script,
nothing more.

When the smoke test fails it prints the last 40 lines of the packaged app's own log before
throwing. That log is usually enough to name the missing file.

## What ends up in the package

```
app\            Next standalone output + .next\static + public + boot.mjs, admin.mjs, verify-update.mjs
node\           node.exe
chromium\       Playwright's browser
scripts\        preflight, configure-env, install-service, verify-health, uninstall-service,
                stop-service, install-monitoring, apply-update, register-updater-task
service\        WinSW as BuyBoxApp.exe, plus BuyBoxApp.xml.template
monitoring\     Alloy installer + config template (when vendored)
installed.json  the component hashes this install holds, read by the update check
```

Nothing else. In particular no `.env`, no database and no licence: the first two are created on
the customer's machine at install time, and the third is pasted into the browser (doc 14 §7).

## Testing an installation

Use a clean Windows VM with **no** Node, **no** Chromium and, for at least one run, **no**
network. The checks that matter are D-1 … D-14 in doc 14 §10. The two worth running on every
release, because they are the ones that lose data rather than merely fail:

- **D-4** — install, finish the setup wizard, then install a newer package over it. Confirm
  `C:\ProgramData\BuyBox\.env.local` still holds the **same** `SECRET_STORE_KEY`, that the
  marketplace credentials still decrypt, and that `C:\ProgramData\BuyBox\backups\` gained a file.
- **D-14** — run the upgrade of D-4 **without stopping the service first**, which is what a
  customer does. There must be no "file in use" prompt and no copy deferred to a reboot, and
  when the wizard finishes `C:\Program Files\BuyBox\app` must hold the new build's files.
  Installing over a running service is the case that fails on a customer machine and never on a
  developer one, where the service is usually already stopped.
- **D-7** — from a second machine on the same LAN, confirm `http://<vm-ip>:3000` does not
  connect. It must not, until authentication exists (doc 14 §4.4).

## Signing

Not done yet — there is no certificate (doc 14 §9). Until there is, publish the `.sha256`
alongside the installer, and expect SmartScreen to warn. When a certificate exists, sign
`installer\out\BuyBoxSetup-<version>.exe` as the last step of `build-package.ps1`, after the hash
is no longer meaningful to compute before signing.
