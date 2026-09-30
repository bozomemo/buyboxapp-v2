# 18 — Authentication, users and access

Status: specification, added 2026-09-27. Nothing in this document is built yet; the build order
is Phase 12 in `docs/12-build-plan.md`.

## 1. What this covers, and the decisions behind it

Until now the application trusted every request it received, and was safe only because nothing
but the machine it ran on could reach it (doc 14 §4.4). This document replaces that with
sign-in, users, roles and a second factor, so that the application can run on a server and be
used from other computers.

Decisions of the product owner, 2026-09-27:

| Decision | Consequence |
|---|---|
| The application moves to a **VPS**, and is used from a browser elsewhere | Remote access comes into scope (doc 14 §1, §13). Today it runs on a Windows machine in a data centre |
| **Trendyol collection was measured to work from the VPS** (2026-09-27) | Hosting is settled. The Playwright exception (api-references §1.6) carries over unchanged |
| **More than one user**, each signing in with a username and password | §3, §4 |
| **The three proposed roles are enough**: Yönetici, Fiyat Yöneticisi, İzleyici. No per-marketplace permissions | Roles are fixed in code, not edited in a screen (§6). "Role management" means giving each user a role |
| **Second factor: an authenticator app (TOTP) and SMS are both acceptable.** No SMS provider has been chosen | TOTP is built in full. SMS is built up to the provider boundary and stays unavailable until a provider adapter exists (§5.3) |

Also decided while writing this, and recorded so each can be challenged:

- **Sign-in is always on, in every install shape.** A loopback-only Windows install also asks
  for a password. An "authentication off" switch would be one flag away from an open server, and
  two code paths would mean the one used in production is the one tested less.
- **The application never terminates TLS itself and never listens on anything but `127.0.0.1`.**
  Remote access always goes through a reverse proxy on the same machine (doc 14 §13). There is no
  `0.0.0.0` option to leave on by mistake.
- **No self-service password reset.** A forgotten password is reset by an administrator, or by the
  break-glass command on the server (§8.3). Reset by SMS or e-mail would make the phone number or
  mailbox a way to take over an account.
- **Implemented in-house on `node:crypto`**, not with an authentication framework. The framework
  would bring its own tables in its own shape, which would have to be carried in all three
  dialects (doc 05 §1). The expensive part of this work is putting a permission check on every
  route, and no framework does that part.

## 2. What this protects against, and what it does not

| Protects against | How |
|---|---|
| Anyone on the internet reaching the price controls | Sign-in on every route (§7); TLS at the reverse proxy |
| A guessed or leaked password | Required second factor on a network install (§5.1); lockout and rate limits (§3.3) |
| A colleague doing more than their job needs | Roles (§6) |
| "Who changed this?" having no answer | Every change records the user who made it (§9) |
| A malicious page making a signed-in browser change a price | SameSite cookie plus an Origin check (§4.3); no framing (§4.4) |
| Someone running up the SMS bill | Per-user, per-number and global send limits (§5.3) |

**Not protected against, deliberately: anyone with a shell on the server.** Whoever can read the
data directory can read the database, the secret store and its key. Access to the machine is the
root of trust. That is why the break-glass command (§8.3) needs only access to the machine and no
password. The server's SSH access therefore needs its own protection: keys only, no password login
(doc 14 §13.3).

The licence stays a commercial control, not a security boundary (doc 13 §1). Nothing here changes
that.

## 3. Accounts and passwords

### 3.1 Users

A user has:

- **A username:** 3 to 32 characters from `a–z`, `0–9`, `.`, `_` and `-`. Lower-cased on entry,
  and unique ignoring case.
  - It is restricted to ASCII so that Turkish casing cannot apply: under a Turkish locale, `I`
    lower-cases to `ı`, not `i`. An ASCII-only name compares the same in every locale (CLAUDE.md:
    culture-invariant on the wire).
- **A display name:** free text, shown in the UI and in the audit trail.
- **A role** (§6): exactly one.
- **A state:** `active` or `disabled`. A disabled user cannot sign in, and all their sessions
  are revoked the moment they are disabled.

**Users are never deleted, only disabled.** Their id is what the audit trail points at (§9), and
deleting a user would turn every change they made into an unexplained one. What disabling *does*
remove is their personal data that serves no audit purpose, which is the phone number (§10).

### 3.2 Passwords

| Rule | Value | Why |
|---|---|---|
| Minimum length | 10 characters | Length is what makes a password hard to guess. The second factor (§5) covers the rest |
| Maximum length | 128 characters | Bounds the hashing cost of a hostile request |
| Composition rules | **None** (no forced digits or symbols) | They produce `Parola1!`, not strength (NIST SP 800-63B §3.1.1.2) |
| Refused | The username itself, and entries in a bundled list of common passwords | The two guesses an attacker makes first |
| Normalisation | Unicode NFC before hashing | So the same password typed on two keyboards hashes the same |
| Expiry | **None** | Forced rotation produces predictable successors. A password is changed when there is a reason to |

**Hashing:**

- `node:crypto` scrypt, with `N = 2^15`, `r = 8`, `p = 1`, a 16-byte random salt and a
  64-byte output.
- Stored as `scrypt$<log2 N>$<r>$<p>$<salt b64>$<hash b64>`, so the cost can be raised later.
  A hash with weaker parameters than the current ones is rehashed at the user's next successful
  sign-in.
- Compared with `timingSafeEqual`.
- An unknown username is checked against a fixed dummy hash, so a response's timing does not
  reveal whether the username exists.
- A hash is a verifier, not a credential: it cannot be used to sign in. It may therefore live in a
  database column. N-1's rule is about secrets that could be used directly. The TOTP secret is one
  of those, which is why it does not live in a column (§5.2).

**Changing a password:**

- **By the user:** they give the current password and the new one. Their other sessions are
  revoked; the current session stays.
- **Reset by an administrator:** the administrator sets a temporary password and hands it over
  in person or by phone, never by the application itself. The user must change it at their next
  sign-in (`must_change_password`). All the user's sessions and trusted devices are revoked.

### 3.3 Lockout and rate limits

Attempts are recorded in the database (`login_attempts`, doc 05 §7a), not in memory, so a
restart does not wipe an attacker's count.

| Limit | Value | Effect |
|---|---|---|
| Failed attempts per username | 5 in 15 minutes | That username is locked for 15 minutes, whatever the source |
| Failed attempts per source address | 20 in 15 minutes | That address is refused for 15 minutes, whatever the username |
| Failed second-factor codes | Count toward the username's 5 | A correct password followed by wrong codes is still an attack |

- **The failure message is always the same:** _Kullanıcı adı veya parola hatalı._ It never says
  which one was wrong, or that the account is locked. A lockout is visible to administrators on the
  users screen (§11), and an administrator can clear it early.
- **Source address:** behind the reverse proxy every request arrives from `127.0.0.1`. The real
  address is taken from `X-Forwarded-For`, but only when `TRUST_PROXY=1`, and only the **last**
  entry, which is the one our own proxy appended. Earlier entries are whatever the client sent.
  Without `TRUST_PROXY`, the per-address limit is not applied, rather than applied to
  `127.0.0.1`, which would lock out everyone at once.

## 4. Sessions

### 4.1 The session token

- **Token:** 32 random bytes (`randomBytes`), sent to the browser once in a cookie. The database
  stores only its SHA-256, so a copy of the database contains no usable session.
- **Cookie:**
  - Name: `__Host-bb_session` on a network install; `bb_session` on a loopback install.
  - Flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` on a network install.
  - The `__Host-` prefix makes the browser refuse the cookie unless it is Secure, host-only and
    for path `/`, so no other site or subdomain can set it.
  - A loopback install is plain `http://127.0.0.1`, so it uses the unprefixed name without
    `Secure`.
- **Lifetime:**
  - A session ends after `AUTH_SESSION_IDLE_MS` (default 8 h) without a request, or
    `AUTH_SESSION_ABSOLUTE_MS` (default 7 days) after sign-in, whichever comes first.
  - `last_seen_at` is written at most once a minute, so browsing the grids does not write to the
    database on every request.
- **New token on:** sign-in, completing the second factor, and a password change. The token
  issued before sign-in never survives it (session fixation).
- **Signing out** deletes the session row, not just the cookie.
- **Permissions are read per request** from the user's current role. A role change therefore
  takes effect on the user's next request, without revoking anything.

### 4.2 Where the session is checked

This check sits in two places, and the second one is the check that actually protects the data:

1. **`apps/web/src/proxy.ts`** redirects a request without a valid session to `/login`, or
   answers `401` on an API path. This check is for convenience: it makes every page behave
   consistently.
2. **Every route handler and every page** checks the session *and* the permission itself
   (§7.2).

The proxy alone is not enough. CVE-2025-29927 let a single request header skip Next.js
middleware entirely, and anything that relied only on the middleware was left open. A handler
that re-checks the session is not exposed to that class of bug.

### 4.3 Cross-site requests

- **`SameSite=Lax`** keeps the cookie off cross-site `POST`, `PUT`, `PATCH` and `DELETE`
  requests.
- **In addition, every state-changing API request is refused with `403` unless its `Origin`
  header matches:**
  - `PUBLIC_ORIGIN` on a network install;
  - the request's own origin on a loopback install.
- A request with no `Origin` header is refused as well.
- **`GET` never changes state.** Phase 12 audits the existing routes against this rule, because
  `SameSite=Lax` still sends the cookie on a top-level cross-site `GET`.

### 4.4 Response headers

The application sends the following on every response:

- `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`, because a price
  edit that can be framed can be clicked by someone who cannot see it;
- `Referrer-Policy: same-origin`;
- `X-Content-Type-Options: nosniff`.

HSTS is set by the reverse proxy (doc 14 §13.2), because only it knows the site is served over
HTTPS.

## 5. Second factor

### 5.1 Policy

- **Network install:** a second factor is **required for every user, and this cannot be turned
  off.** A user who has none enrolled is sent to enrol it right after the password step, and can
  do nothing else until they have.
- **Loopback install:** a second factor is optional. It is controlled by `auth.mfaRequired` in
  `app_settings`, default off.
- **Methods:** a user may enrol TOTP, SMS or both, and chooses one at each sign-in.
- **Recovery codes (§5.4)** are issued with the first method enrolled.

**Sign-in flow:**

```
username + password ──ok──▶ challenge (5 min, one per attempt)
                              ├─ TOTP code        ─ok─▶ session
                              ├─ SMS code         ─ok─▶ session
                              └─ recovery code    ─ok─▶ session + warning banner
```

- **The challenge:** a row in `mfa_challenges`, bound to the user and to a separate short-lived
  cookie. It holds no permissions: a browser that has passed the password but not the second
  factor can reach only the challenge screen and sign-out.
- **Trusted device:**
  - After a successful second factor the user may tick _Bu cihazı 30 gün hatırla_. For
    `AUTH_TRUSTED_DEVICE_DAYS` (default 30; `0` removes the option), that browser then skips the
    second factor. **It never skips the password.**
  - Stored like a session: a random token in a cookie, and its hash in `trusted_devices`.
  - Revoked by a password change, a second-factor reset, disabling the user, or the user's own
    _Tüm cihazlardan çıkış yap_.

### 5.2 TOTP

- **Standard:** RFC 6238 with HMAC-SHA-1, 6 digits and a 30-second step, accepting one step either
  side for clock drift. This is the combination every mainstream authenticator app
  (Google/Microsoft Authenticator, Authy, 1Password) supports.
- **Replay protection:** a code is accepted only once. The last accepted time step is stored, and
  a code for that step or an earlier one is refused.
- **The secret:**
  - 20 random bytes.
  - Stored in the **secret store** (`packages/shared/src/secrets/store.ts`) under
    `user:<id>:totp`, **never in a database column** (N-1). Unlike a password hash, the secret
    can be used directly to produce valid codes.
- **Enrolment:**
  - Show a QR code of the `otpauth://` URI, rendered to SVG on the server, plus the key as text
    for manual entry.
  - The method is only turned on after the user types a correct code from their app. An
    unconfirmed secret is discarded after 15 minutes.
- **Issuer label:** `BuyBox (<store display name>)`, so two installs on one phone can be told
  apart.
- **Implementation:** written in-house against the RFC 6238 Appendix B test vectors, which are a
  table-driven unit test. It is about forty lines, and does not justify a dependency.

### 5.3 SMS

**Built now, up to the provider boundary.** When no provider is configured, SMS is simply not
offered:

- the enrolment screen does not list it;
- the sign-in screen does not offer it;
- the users screen says _SMS sağlayıcısı yapılandırılmadı_.

A user who wants SMS uses TOTP until a provider is connected. Everything except the provider
adapter is built and tested.

**The port.** `SmsSender` in `packages/adapters` has one method: `send(to: E164, text) →
Result<{ providerRef }>`. It is the **same port** as doc 17 §6.1's SMS notification channel.
Whichever of Phase 11.7 and Phase 12 lands first builds it, and the other reuses it. Adapters:

| Adapter | When | Behaviour |
|---|---|---|
| `DisabledSmsSender` | `SMS_PROVIDER` unset — the state today | Reports itself unavailable; SMS is hidden (above) |
| `DevConsoleSmsSender` | `SMS_PROVIDER=dev-console`, development only | Writes the message to the development log. **The service refuses to boot with it when `NODE_ENV=production`**, because it would put codes in the logs, and logs are shipped to Grafana (doc 16) |
| Provider adapter (Netgsm / İleti Merkezi / Verimor) | `SMS_PROVIDER=<name>` + provider credentials in env | Built when the product owner chooses a provider (§12). Tested against recorded response fixtures, like every adapter |

**Phone numbers:**

- Stored in E.164 form (`+905xxxxxxxxx`). Entry accepts the usual Turkish forms (`05xx…`,
  `5xx…`, with spaces) and normalises them.
- A number becomes usable only after a code sent to it has been typed back. An administrator
  can set a user's number but cannot mark it verified.

**The code:**

- **Format:** 6 digits from `randomInt`.
- **Storage:** only its HMAC-SHA-256 is stored in `sms_codes`. The key is derived from
  `SECRET_STORE_KEY` and the row id is part of the message.
  - A key held in the database would be useless: a six-digit code has only a million values, so a
    leaked row plus a key stored beside it can be brute-forced in a second.
  - A key that is not in the database is what stops that.
  - Corrected 2026-09-27, while building 12.1. The first draft said "keyed per challenge", which
    does not do this.
- **Validity:** `AUTH_SMS_CODE_TTL_MS` (default 5 min), and `AUTH_SMS_MAX_ATTEMPTS` (default 5)
  wrong entries, after which the challenge is spent.
- **Resending:**
  - Allowed after `AUTH_SMS_RESEND_MS` (default 60 s).
  - A resend replaces the code; it does not add a second one that is also valid.
- **Message text** (Turkish, no username, no link):
  _BuyBox doğrulama kodunuz: 123456. 5 dakika geçerlidir. Bu kodu kimseyle paylaşmayın._

**Send limits.** These guard against SMS pumping, where an attacker triggers paid messages to
premium numbers:

| Limit | Default |
|---|---|
| Per user | 5 per hour |
| Per phone number | 10 per day |
| Whole install | `AUTH_SMS_DAILY_CAP` = 200 per day, then SMS is refused for everyone until midnight (Europe/Istanbul) and an `error` event is written |

- Every one of these limits applies **after** the password has been verified. An anonymous
  caller cannot make the application send a message.
- Send failures are recorded in `auth_events` (§9.2). A failure never falls back to sending
  another way: the user picks another method.

### 5.4 Recovery codes

- 10 one-time codes of 10 base32 characters each, shown **once**, when the first method is
  enrolled or when the user regenerates them.
- Stored as SHA-256 hashes. Their 50 bits of entropy make a slow hash unnecessary.
- Using one signs the user in, marks the code spent, and shows a banner with how many remain.
- Regenerating the codes invalidates the old set.

## 6. Roles and permissions

### 6.1 Permissions

**Permissions are a catalogue defined in code** (`packages/shared/src/auth/permissions.ts`).
Each route and page names the one permission it needs (§7.2).

| Permission | Covers |
|---|---|
| `view` | Every screen and every read API, including the CSV exports |
| `automation.stop` | **Engaging** the global and per-marketplace kill switches and the system pause |
| `prices.manage` | Manual price edits, listing bulk actions, stock preferences (automation flags, multipliers), stock import and bundles, and **releasing** kill switches and the pause |
| `catalogue.manage` | Tracked products, watched brands and groups, brand products and their import and cards, seller policies and their import, alert rules, brand-report thresholds, competitor seller groups and identities, favourites, rescans |
| `jobs.operate` | Run now, enabling or disabling a job, circuit-breaker reset, starting a sweep |
| `settings.manage` | Fees, policy (including _preview impact_), retention, modules, product sources, marketplaces and their credentials, database, the setup wizard, the licence, job cadence, scrape rate, worker restart |
| `users.manage` | The users screen: create, disable, change role, reset password, reset second factor, clear lockout, and the sign-in log |

**Stopping and releasing are separate permissions on purpose.** Stopping the bot can never lose
money, so a role could be allowed to stop without being allowed to release. Releasing sends
prices to the marketplace again.

Today both belong to the same two roles. The product owner decided on 2026-09-27 that İzleyici
only views, and cannot stop the bot either. The draft had given it `automation.stop`.

### 6.2 Roles

Fixed in code. A user's role is a column on the user, not a join table, because a user has
exactly one role.

| Permission | Yönetici | Fiyat Yöneticisi | İzleyici |
|---|:-:|:-:|:-:|
| `view` | ✓ | ✓ | ✓ |
| `automation.stop` | ✓ | ✓ | |
| `prices.manage` | ✓ | ✓ | |
| `catalogue.manage` | ✓ | ✓ | |
| `jobs.operate` | ✓ | ✓ | |
| `settings.manage` | ✓ | | |
| `users.manage` | ✓ | | |

- **Role codes are stored in English** (`admin`, `price_manager`, `viewer`), culture-invariant.
  The Turkish names are display labels.
- **Adding a role later** means a new row in this table in code and a check-constraint
  migration. That is acceptable for a change expected rarely, if ever.
- **Credentials are never returned to the browser, for any role, including Yönetici.** The
  marketplace credential fields stay write-only (doc 06 §9). `settings.manage` allows replacing a
  credential, never reading it.

### 6.3 Protecting the last administrator

The following are refused whenever the result would leave **no active Yönetici**:

- disabling a user;
- changing a user's role;
- an administrator changing their own role.

Separately, an administrator cannot disable their own account; another administrator has to.
Without these rules an install can lock itself out, and the only way back is the break-glass
command (§8.3).

## 7. Enforcement

### 7.1 Order of checks in `proxy.ts`

```
1. static assets                              → pass (existing matcher)
2. auth-exempt paths (§7.3)                   → pass
3. no active administrator exists             → /bootstrap (§8.1)
4. no valid session                           → /login   (API: 401)
5. session valid, second factor pending       → /login/mfa (API: 401)
6. must_change_password                       → /account/password (API: 403)
7. licence gate                               → /license (API: 402)   — existing, unchanged
8. module gate                                → existing, unchanged
```

**The licence gate moves after sign-in.** Previously anyone who opened the application could
enter a licence. On a server that means anyone on the internet. `/license` now needs a signed-in
user with `settings.manage`.

An expired licence does not stop anyone signing in. It would be wrong for a lapsed licence to
lock out the one person who can paste the new one.

### 7.2 In every handler and page

- **API route handlers:** wrapped in `withPermission('<permission>', handler)`. The wrapper
  resolves the session and user, checks the permission, and passes an `actor` (§9) to the
  handler. It answers `401` with no session and `403` with the wrong permission.
- **Pages (server components):** call `requirePermission('<permission>')`. Without permission
  it shows a _Bu sayfayı görüntüleme yetkiniz yok_ page, not a redirect loop.
- **A route file with an export that is not wrapped fails CI.** A test walks
  `apps/web/src/app/api/**/route.ts`, imports each file, and asserts that every exported method
  carries the wrapper's marker, or is listed in the exempt table (§7.3). There are 83 route
  files today; without this test, the next one added is the one that gets forgotten.
- **The UI hides controls the user lacks permission for** (a viewer sees no price edit cell). The
  hiding is a courtesy, not the protection. The protection is the handler.

### 7.3 Exempt paths

| Path | Why | Reachable from outside the server? |
|---|---|---|
| `/login`, `/login/mfa`, `/api/auth/*` | Signing in | Yes |
| `/bootstrap`, `/api/bootstrap/*` | Creating the first administrator (§8.1). Refused once one exists | Yes, but only with the setup token |
| `/api/health` | The installer polls it before any user exists (doc 14 §5.1) | **No.** The reverse proxy does not forward it (doc 14 §13.2) |
| `/api/metrics` | Alloy reads it on the machine (doc 16 §3) | **No**, same |

`/license` and `/api/license` **stop being exempt from sign-in** (§7.1). They stay exempt from
the licence gate.

**Also settled while building 12.3 (2026-09-27):**

- **`/account/password` is exempt from the licence gate, but not from sign-in.**
  - The general reason is §7.1's: a lapsed licence must never lock anyone out of their own
    account.
  - The concrete reason is a loop found in testing. On an unlicensed install, a user holding a
    temporary password is sent to `/account/password` by the sign-in check and to `/license` by
    the licence check. Each screen then sends them to the other.
- **The Origin check (§4.3) runs in the proxy, ahead of everything else, on every path.** That
  includes the sign-in and bootstrap forms, which have no session cookie to withhold.
  - The per-handler wrapper (12.4) does not repeat it.
  - A request that skips the proxy entirely gets no session either, because the handler resolves
    the session from the cookie itself.
- **Route handlers read the session cookie from the `Request` they are given**, not from
  `next/headers`. It is the same header, and it keeps a handler callable, and testable, outside
  Next's request scope.

**Settled while building 12.4 (2026-09-27):**

- **A refusal puts its Turkish sentence in `error` and its reason in `code`.** For example:
  `{ "error": "Bu işlem için yetkiniz yok.", "code": "forbidden" }`. Every screen written before
  sign-in shows `data.error` to the operator, so this way a refused click explains itself on all
  of them, with no per-screen change.
- **Hiding and disabling controls covers the controls that move money or the bot**, not every
  form:
  - the three stop controls, where releasing needs `prices.manage`;
  - the listing price, the price bounds and the automation switches;
  - "run now".
  - A viewer also sees a _Salt okunur_ badge in the header.
  - Other screens rely on the server's refusal, and that is sufficient, because the handler is
    the protection (§7.2).
- **İzleyici holds only `view`** (the product owner's decision of 2026-09-27, §6.2).

**Settled while building 12.7 (2026-09-27):**

- **Removing a method and reissuing recovery codes ask for the password again.** A browser left
  signed in must not be enough to weaken the account.
- **Removing the last method also deletes the recovery codes and forgets trusted devices.** Both
  exist only in service of a second factor.
- **The challenge screen asks nothing about who the user is.** `GET /api/auth/mfa` returns the
  methods, the masked phone and the trusted-device option, from the challenge cookie alone.
- **The TOTP secret is stored base32-encoded** in the secret store, under `user:<id>:totp`, and
  under `user:<id>:totp:pending` until confirmed.

## 8. First administrator, database switch, and recovery

### 8.1 Bootstrap

While the configured database has **no active Yönetici**, the install is in **bootstrap mode**:
every route goes to `/bootstrap`. This covers a fresh install, and an existing install upgraded
to the first version with sign-in. It is how the live install will get its first user.

1. **The setup token.**
   - On boot in bootstrap mode, the service writes a new setup token (20 random bytes, base32) to
     `<data dir>/bootstrap-token.txt`. On Linux the file mode is `0600`, owned by `buybox`. On
     Windows the ProgramData ACL applies.
   - It is **never logged**. The log line says only where the file is: logs go to Grafana
     (doc 16), and a token in the log is a token on the internet.
   - `/api/health` never returns it.
2. **Where the operator finds it:**
   - The Windows installer's final page reads the file and shows the token.
   - The Linux `postinst` prints the command to read it (`sudo cat /var/lib/buybox/bootstrap-token.txt`).
   - `/bootstrap` names the file.
3. **The form:**
   - `/bootstrap` asks for the token, a username, a display name and a password (§3.2), and
     creates a Yönetici.
   - The token is compared in constant time.
   - Five wrong tokens from one address lock the form for 15 minutes, as in §3.3.
4. **On success:** the token file is deleted and the administrator is signed in. On a network
   install they are then taken to enrol a second factor (§5.1).

After bootstrap, a fresh install continues as before: licence, then the setup wizard. The
wizard is now used by a signed-in administrator.

**A checkout with no database yet** (no `DATABASE_URL`; the installer always writes one, so only
a development checkout starts this way) has nowhere to put a user.

- **What the token opens:** in bootstrap mode, the setup token also opens `/setup` and
  `/license`, and nothing else.
- **The flow:** the operator enters the token, completes the wizard's database step, and returns
  to `/bootstrap` to create the administrator.
- **Setup access** is a strict, httpOnly cookie holding the token, valid for one hour. Every
  request re-checks it against the file, so it dies with the file: once the administrator
  exists, the file is deleted.
- **Boot log:** the boot-time log line names the token file under the key `setupFile`. The
  logger redacts any value whose key contains "token", which is right for the token itself and
  would have hidden the path.

### 8.2 Switching database

The setup wizard's database step and `/settings/database` can point the install at a
different database (doc 10 §6), and a new database has no users in it. Switching would
therefore drop the administrator doing the switch into bootstrap mode, halfway through
configuring.

Rule: when the target database has no active Yönetici, the switch **copies the acting
administrator's user row** into it, including role, password hash and second-factor enrolment.
The TOTP secret needs no copying, because the secret store is outside the database. Nothing else
about users is copied. When the target already has an administrator, nothing is copied, and the
acting user must exist there to stay signed in.

### 8.3 Break-glass

`node scripts/admin.mjs <command>` runs on the server as the service user and reads the same
bootstrap environment as the service (doc 14 §4.3).

- **Where it comes from:** the packages ship it bundled as `app/admin.mjs`, built by
  `scripts/build-admin-cli.mjs`, because an installed server has no repository to import from.
- **Where to run it:** from the data directory, whose `.env.local` it reads. The exact command
  for each platform is in doc 14 §13.6.

| Command | Does |
|---|---|
| `create-admin <username>` | Creates a Yönetici, asking for the password on the terminal |
| `reset-password <username>` | Sets a temporary password with `must_change_password` |
| `reset-mfa <username>` | Removes the user's second-factor enrolment and recovery codes. On a network install they re-enrol at their next sign-in |
| `unlock <username>` | Clears the lockout |
| `list-users` | Username, role, state and methods, with no secrets |

- Every command writes an `auth_events` row with actor `cli` (§9).
- The script's only trust check is access to the machine (§2). That is what makes it a
  break-glass, and why SSH access matters (doc 14 §13.3).

**Losing the second factor.** An administrator resets another user's second factor from the
users screen. The last administrator, with no one left to do it for them, uses `reset-mfa` over
SSH.

## 9. Who did what

### 9.1 Actors

Every write records an **actor**. It is written to the existing `changed_by` / `updated_by`
columns and to the new `price_submissions.requested_by`.

| Actor value | Meaning |
|---|---|
| `user:<uuid>` | A signed-in user. Displayed by joining to the user's display name |
| `system` | A job, the scheduler, or the engine |
| `cli` | The break-glass command (§8.3) |
| `operator` | **Existing rows only.** Written before sign-in existed. Displayed as _Operatör (eski kayıt)_ and never written again |

Today 16 route files write the literal `'operator'` (for example `api/kill-switch/route.ts`,
`api/settings/fees/save/route.ts` and `api/stock/prefs/route.ts`). Each is changed to use the
actor that `withPermission` passes in.

The engine's own submissions keep `requested_by` null. A manual price edit records the user.
_"Who set this price?"_ then has an answer on every row.

### 9.2 The sign-in log

Authentication events go to their own table, `auth_events`, not to `app_events`:

- `app_events` is a diagnostic log kept for 3 or 30 days (doc 05 §10);
- sign-in history is an audit record, and needs a year.

**Events recorded:**

- sign-in succeeded or failed, lockout, sign-out;
- second factor passed, failed, enrolled or removed;
- recovery code used;
- SMS sent or failed;
- password changed or reset;
- user created, disabled, re-enabled, or their role changed;
- bootstrap completed;
- every break-glass command.

Each row has the time, the event, the user (when known), the actor, the source address, and a
shortened user agent. **It never contains a password, a code or a token**, including a mistyped
one.

Shown to `users.manage` on the users screen (doc 06 §10).

## 10. Personal data (KVKK)

This feature introduces personal data the application did not hold before: names, phone
numbers, source addresses and user agents.

| Data | Why it is held | Kept |
|---|---|---|
| Display name, username | Attribution of changes (§9) | Until the user is disabled; the row remains for attribution, as §3.1 explains |
| Phone number | SMS second factor | Until the user removes SMS or is disabled. **Cleared on disable** |
| Source address, user agent | Security record (§9.2) | `auth_events` 365 days |

The application sends a phone number only to the configured SMS provider, and only to deliver
a code. **Two points the product owner must confirm:**

- the KVKK disclosure (_aydınlatma metni_) to employees;
- whether a transactional one-time code needs İYS registration. It is generally held not to, but
  this should be confirmed with the chosen provider (§12).

## 11. Screens

Detailed in doc 06 §10. In summary:

| Route | Who | Purpose |
|---|---|---|
| `/login`, `/login/mfa` | Anyone | Sign in; choose a second factor |
| `/bootstrap` | Holder of the setup token | First administrator (§8.1) |
| `/account` | Every user | Change password, enrol or remove TOTP and SMS, regenerate recovery codes, sign out everywhere, list trusted devices |
| `/settings/users` | `users.manage` | Users: create, role, disable, reset password, reset second factor, clear lockout |
| `/settings/users/activity` | `users.manage` | The sign-in log (§9.2), filterable |

The header shows the signed-in user's display name and role, with a sign-out button.

## 12. Open items

| Item | Blocks | Owner |
|---|---|---|
| **SMS provider**: choice, account, sender name (_başlık_) registration, cost per message. Shared with doc 17 §7 | The SMS adapter only. Everything else in §5.3 is built regardless | product owner |
| **İYS**: confirm with the provider that a transactional one-time code needs no İYS consent | Sending SMS in production | product owner |
| **KVKK disclosure** to employees whose names, numbers and addresses are recorded (§10) | Go-live on the server | product owner |
| **Domain name and TLS certificate** for the server (doc 14 §13) | Network mode | product owner |

## 13. Out of scope

- Single sign-on (Google, Microsoft, LDAP).
- Self-service password reset (§1).
- Per-marketplace or per-listing permissions (decided 2026-09-27).
- API tokens for third-party callers.
- Passkeys / WebAuthn. This is the natural next step after TOTP, and it resists phishing, which
  SMS and TOTP do not. Revisit if a user is ever phished.

## 14. Requirements

The IDs live in `docs/11-rewrite-requirements.md` §9c. They are reproduced here with their
sections.

| ID | Pri | Requirement | Section |
|---|---|---|---|
| R-AUTH-1 | M | Every route and page except §7.3's exempt list requires a signed-in user, checked in the handler as well as the proxy | §4.2, §7 |
| R-AUTH-2 | M | Every route export is wrapped with a permission, enforced by a CI test | §7.2 |
| R-AUTH-3 | M | Passwords are hashed with scrypt; sessions and codes are stored only as hashes; no password, code or token is ever logged | §3.2, §4.1, §9.2 |
| R-AUTH-4 | M | Five failed attempts lock a username for 15 minutes; the failure message never says which part was wrong | §3.3 |
| R-AUTH-5 | M | A network install requires a second factor for every user, with no way to turn it off | §5.1 |
| R-AUTH-6 | M | TOTP passes the RFC 6238 test vectors and refuses a replayed code | §5.2 |
| R-AUTH-7 | M | The TOTP secret lives in the secret store, never in a database column | §5.2 |
| R-AUTH-8 | M | With no SMS provider configured, SMS is not offered anywhere, and nothing else depends on it | §5.3 |
| R-AUTH-9 | M | No SMS is sent before a password has been verified; per-user, per-number and daily caps hold | §5.3 |
| R-AUTH-10 | M | The three roles grant exactly the §6.2 matrix; a viewer's write request is refused with 403 by the handler | §6 |
| R-AUTH-11 | M | No action leaves the install without an active Yönetici | §6.3 |
| R-AUTH-12 | M | A state-changing request with a foreign or missing `Origin` is refused | §4.3 |
| R-AUTH-13 | M | Every write records the acting user, and a manual price submission records who requested it | §9.1 |
| R-AUTH-14 | M | Bootstrap needs the setup token from the data directory, which is never logged, and ends once an administrator exists | §8.1 |
| R-AUTH-15 | M | The break-glass command can reset a password or second factor using only access to the machine | §8.3 |
| R-AUTH-16 | S | Switching database carries the acting administrator into a target that has none | §8.2 |
| R-AUTH-17 | S | Trusted devices skip only the second factor, never the password, and are revoked by a password change | §5.1 |
