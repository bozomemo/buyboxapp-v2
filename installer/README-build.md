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
| Node 22 (x64) | `winget install OpenJS.NodeJS.LTS`. The **same major version** must be on `PATH` when you build — it is the runtime that gets bundled. |
| Inno Setup 6 | `winget install JRSoftware.InnoSetup`. Winget installs it per-user under `%LOCALAPPDATA%\Programs`; the build script finds it there, in Program Files, or via the uninstall registry, so you do not have to place it anywhere particular. |
| WinSW | Download `WinSW-x64.exe` from `https://github.com/winsw/winsw/releases`, verify its SHA-256 against the release page, and save it as `installer\vendor\WinSW.exe`. |

WinSW is **vendored deliberately**, not downloaded during a build: what runs on a customer's
machine as a service should be a binary we chose and checked once, not whatever a URL served on
build day.

## Building

```powershell
# from the repository root
powershell -ExecutionPolicy Bypass -File installer\build-package.ps1
```

Produces `installer\out\BuyBoxSetup-<version>.exe` and a `.sha256` next to it. The version comes
from the root `package.json` unless you pass `-Version`.

For local iteration:

```powershell
# skip typecheck+tests (never do this for a release)
powershell -ExecutionPolicy Bypass -File installer\build-package.ps1 -SkipTests

# assemble installer\staging without compiling, to inspect what would be packed
powershell -ExecutionPolicy Bypass -File installer\build-package.ps1 -SkipCompile
```

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
app\        Next standalone output + .next\static + public + boot.mjs
node\       node.exe
chromium\   Playwright's browser
scripts\    preflight, configure-env, install-service, verify-health, uninstall-service
service\    WinSW as BuyBoxApp.exe, plus BuyBoxApp.xml.template
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
