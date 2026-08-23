# 13 — Licensing

Status: specification. Added 2026-08-23.

## 1. What this is for, and what it is not

The system is delivered as a self-hosted install: the operator runs `apps/web` and
`apps/worker` on their own machine, against their own database. Licensing exists so that an
install is tied to a commercial agreement — an unlicensed copy refuses to work, and a lapsed
one stops.

**It is a commercial control, not a security boundary.** Whoever operates the machine can read
and edit the JavaScript, and can therefore remove any check in it. Nothing in this document
pretends otherwise. The design goals, in order, are:

1. An install that was never licensed cannot be *accidentally* useful.
2. A lapsed licence stops the system in a way that is visible and self-explanatory, and that
   an operator can fix themselves by pasting a new licence — with no redeploy and no restart.
3. Defeating it requires deliberately editing the source, which is an unambiguous breach
   rather than an oversight.

Anti-tamper beyond that (obfuscation, native modules, integrity self-checks) is explicitly out
of scope. It would cost real effort, harm supportability, and still not work.

## 2. Licence token

A licence is a single opaque string the vendor issues and the operator pastes in. It is
verified entirely offline: there is no licence server, no activation call and no heartbeat, so
no vendor outage and no network failure can ever stop a customer's repricing.

Format — three dot-separated parts:

```
BBX1.<base64url(payload JSON)>.<base64url(Ed25519 signature)>
```

- `BBX1` is the format version. An unrecognised prefix is an invalid licence, not an error to
  guess around.
- The signature is over the **raw payload JSON bytes** (the bytes that base64url-decode out of
  part 2), using Ed25519.
- The vendor's private key never leaves the vendor. The corresponding public key is compiled
  into `packages/shared/src/license/public-key.ts`.

### 2.1 Claims

| Field | Type | Required | Meaning |
|---|---|---|---|
| `v` | `1` | yes | Claims-schema version. |
| `id` | string | yes | Licence id, for support and for the audit trail. |
| `customer` | string | yes | Display name, shown in the UI. |
| `issuedAt` | ISO 8601 date-time | yes | When the vendor issued it. |
| `expiresAt` | ISO 8601 date-time | yes | Hard expiry. There is no perpetual licence. |
| `edition` | `'standard' \| 'trial'` | yes | Shown in the UI; `trial` is styled as such. |
| `marketplaces` | string[] | no | Marketplace codes the licence covers. Absent = all. |
| `maxListings` | integer | no | Soft cap. Absent = uncapped. |
| `fingerprint` | string | no | Install binding, see §5. |

Money is not involved, so the `bigint`-in-kuruş rule does not apply here. Every timestamp in
the token is an ISO string, because a licence is read by humans in support conversations;
every timestamp inside the code is epoch milliseconds, as everywhere else.

## 3. Where the licence lives

Resolution order, first hit wins:

1. `LICENSE_TOKEN` environment variable — for container and CI installs that configure
   everything through the environment.
2. The `license.token` row in `app_settings` — written by the setup wizard's licence step and
   by the Licence settings screen.

The token is **signed public data, not a credential**: it carries no secret, and anyone
holding it already has it. Storing it in `app_settings` therefore does not breach the
"no credential in a database column" rule, and it is what lets one paste in the UI license
both the web process and the worker without a redeploy.

## 4. Verification and states

`verifyLicense(token, { publicKeyPem, nowMs, graceMs, lastSeenMs, fingerprint })` lives in
`packages/shared/src/license` and is **pure**: the clock is an input, there is no I/O, and the
same inputs always produce the same status. It returns exactly one of:

| State | Meaning | System runs? |
|---|---|---|
| `valid` | Signature good, not expired. | yes |
| `grace` | Expired less than `graceMs` ago. | yes, with a banner |
| `expired` | Expired longer ago than `graceMs`. | **no** |
| `invalid` | Malformed, bad signature, unknown version, clock rollback. | **no** |
| `missing` | No token configured at all. | **no** |

**Fail-closed, exactly like the kill switches** (`packages/shared/src/kill-switch.ts`): every
outcome that is not affirmatively `valid` or `grace` means "stopped". An absent row, a
corrupted value, a truncated paste and an unparseable payload all land in the same place.

### 4.1 Grace period

`LICENSE_GRACE_MS` is **7 days**. During grace the system runs normally and the UI shows a
persistent Turkish banner counting down the remaining days. This exists so that a renewal that
lands a day late is an annoyance, not an outage during the trading day.

### 4.2 Expiry behaviour

After grace, the system behaves exactly as though the system pause (doc 06 §2) were engaged:
`Scheduler.tick()` enqueues nothing and claims nothing, so no import, no buybox observation,
no repricing decision and no price submission happens. The web UI redirects every route except
the licence screen itself.

The licence is re-evaluated **on every tick**, not once at boot. Pasting a valid renewal
brings the system back within one scheduler interval, with no process restart. Correspondingly
the worker process must **not** exit or crash-loop when unlicensed: it stays up, ticks, logs
once per transition, and does nothing else.

### 4.3 Clock rollback

The only offline attack worth a cheap defence is winding the system clock back. The app keeps
a monotonic high-water mark in the `license.lastSeenAt` `app_settings` row, updated whenever a
licence is evaluated. If `nowMs` is more than `CLOCK_SKEW_TOLERANCE_MS` (**24 hours**) behind
that mark, the status is `invalid` with reason `clock-rollback`.

24 hours of tolerance is deliberate: NTP corrections, daylight-saving misconfiguration and VM
snapshot restores all move a clock backwards by legitimate amounts, and none of them should
take a customer's repricing down.

## 5. Install binding is soft, on purpose

If `fingerprint` is present in the claims, it is compared against a caller-supplied install
fingerprint (`sha256(machine-id + ':' + database name)`). A mismatch **warns** — a banner in
the UI and a logged event — and does **not** stop the system.

Hard binding was considered and rejected. Disaster restores, VM migrations, hostname changes
and hardware replacement all change a fingerprint, and every one of those already happens on
the worst possible day. A licence that turns a server migration into an outage costs more in
support than it saves in enforcement.

## 6. Enforcement points

There are exactly two, and both read the same pure verifier:

1. **`apps/web/src/proxy.ts`** (Next 16's proxy convention — the renamed, no-longer-called
   `middleware.ts`; Node.js is its default runtime) — redirects every request to `/license`
   unless the status is `valid` or `grace`. Exempt: `/license`, `/api/license`, Next.js
   internals and static assets. Status is cached in-process for
   `LICENSE_CACHE_TTL_MS` (60 s) so the gate does not add a database round-trip per request.
2. **`Scheduler.tick()`** — checked immediately after the system-pause check, before anything
   is enqueued or claimed, and reported as `unlicensed: true` on the tick result so it is
   distinguishable from a pause and from not holding the lock.

`/setup` is an ordinary route as far as (1) is concerned — it is **not** exempt — so a fresh
install cannot reach the setup wizard, let alone finish it, without first landing on `/license`
and pasting a working key. This is deliberately the *only* enforcement point on the web side:
a dedicated licence step inside the wizard would be redundant with a gate the operator has
already had to clear to reach the wizard at all.

## 7. Issuing a licence (vendor side)

`scripts/generate-license-keypair.mjs` creates the Ed25519 keypair once. The private key is
written to `.license-keys/`, which is gitignored; it must be backed up offline, because
losing it means every existing licence can still be verified but no new one can be issued,
and rotating the public key invalidates every licence in the field at once.

`scripts/issue-license.mjs` signs a token:

```
node scripts/issue-license.mjs --customer "Örnek Ticaret A.Ş." --months 12
```

Because there is no revocation channel (§1), **licence terms should be short** — annual for
established customers, monthly for new ones. Not renewing is the only revocation that exists.

## 8. Acceptance

- R-LIC-1 — A fresh install with no licence reaches only `/license`; every other route
  redirects there, and the scheduler enqueues and runs nothing.
- R-LIC-2 — A tampered payload, a signature from any other key, an unknown format prefix and a
  truncated token are each rejected as `invalid`.
- R-LIC-3 — An expired licence within 7 days runs, and shows a countdown banner.
- R-LIC-4 — An expired licence past 7 days stops every job and gates the UI.
- R-LIC-5 — Pasting a valid licence into a stopped install restores it within one scheduler
  tick, with no restart.
- R-LIC-6 — Winding the clock back more than 24 hours yields `invalid`; less than 24 hours
  does not.
- R-LIC-7 — A fingerprint mismatch warns and does not stop the system.
