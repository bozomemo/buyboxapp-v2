# Vendored binaries

## `WinSW.exe`

The Windows service wrapper the installed product runs (doc 14 §5 step 7). Download
`WinSW-x64.exe` from <https://github.com/winsw/winsw/releases>, check its SHA-256 against the
release page, and save it here as `WinSW.exe`.

It is vendored rather than fetched during a build on purpose: what runs as a service on a
customer's machine should be a binary we chose and hashed once, not whatever a URL served on
build day. `build-package.ps1` fails with a pointer to this file if it is missing.

Record the version and hash here when you add it, so a later build can be checked against it.

| Version | SHA-256 | Added |
|2.12.0|59a97f9d7c1d6e10fa41ea9339568fb25ec55e27|---|

## `alloy-installer-windows-amd64.exe`

The Grafana Alloy agent that ships logs and metrics to Grafana Cloud (doc 16). Download
`alloy-installer-windows-amd64.exe` from <https://github.com/grafana/alloy/releases>, check its
SHA-256 against the release page, and save it here under that exact name.

Vendored for the same reason as WinSW, and additionally because it is large: ~109 MB, which adds
about **101 MB** to the compiled installer — measured 2026-09-08, 279 MB → 385 MB. LZMA2 buys
almost nothing here because Alloy's installer is already compressed; do not expect it to shrink.
Fetching that during a build would make every build depend on GitHub being reachable and on
whatever the URL served that day.

**Unlike WinSW, this one is not committed.** At 109 MB it is over GitHub's 100 MB per-file hard
limit, so it is in `.gitignore` and every machine that builds a monitoring-carrying package
downloads it here by hand, checking the hash below. That is only tolerable because of the next
point.

**Unlike WinSW, a missing Alloy is a warning rather than a build failure.** A package without it
installs and runs a completely working product that simply has no remote monitoring —
`install-monitoring.ps1` reports that and carries on. This keeps a routine developer build from
depending on a 109 MB binary that has nothing to do with pricing.

Note that this is Alloy's *installer*, not the agent binary. It is run once, silently, by
`install-monitoring.ps1`, and places Alloy in its own directory — deliberately not under
`Program Files\BuyBox`, which an upgrade empties wholesale (doc 14 §5 step 3). That is what lets
the agent keep shipping logs straight through a BuyBox upgrade.

| Version | SHA-256 | Added |
|---|---|---|
| v1.19.2 | `72b19a3f547a4d21b6c617e0934a8471fbce4867e03f65f1b49a42d23d378e36` | 2026-09-08 |

Verified against the release's own `SHA256SUMS` on the day it was added.
