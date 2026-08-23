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
