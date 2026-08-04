# Authorization Hardening — Phase 1

**Date:** 2026-08-04
**Branch:** `security/authorization-hardening-2026-08-04`
**Parent baseline:** `baseline/reconciliation-2026-08-04` (`1777137`)

## Scope

Phase 1 closes the credential-entry findings from the Authorization and Data-Scope Census. It
establishes one server-enforced policy for who may authenticate with a Quick PIN, and replaces
process-local PIN throttling with a durable limiter shared by both login surfaces.

It does not redesign the broader authorization architecture. See [Deferred work](#deferred-work).

## Original findings

| ID | Finding |
| --- | --- |
| CRIT-1 | Quick PIN could mint a Facility Administrator, GM, Manager, or Supervisor session even though those roles are required to use email and password. |
| CRIT-1B | PIN rate limiting was process-local and keyed partly on the client-controlled `X-Forwarded-For` header, so guessing could continue by rotating the header or reaching another instance. |
| HIGH-2 | Standard email/password login had no rate limiting at all. |

### How CRIT-1 was reachable

`src/lib/credential-policy.ts` already declared that higher-authority roles require an
email/password account, but that rule was only consulted by the employee forms and by user-account
creation. Three gaps let a PIN reach a high-authority session:

1. `setEmployeePinAction` did not check the employee's role, so a PIN could be issued to any role.
2. `updateEmployeeProfileAction` and the CSV importer changed `roleType` without touching
   `pinDigest`, so a PIN issued while an employee was STAFF kept working after promotion.
3. `POST /api/auth/pin-login` looked up the employee by PIN digest and active status only, then
   signed a session at whatever `roleType` the row carried.

## Credential eligibility rule

The canonical decision is `mayAuthenticateWithQuickPin` in `src/lib/credential-policy.ts`. It is
derived from the existing `requiresEmailPasswordAccount` predicate rather than a second role list,
so the two cannot drift, and a test asserts they remain exact complements across every `RoleKey`.
Anything that is not a known eligible role — including unknown strings, `null`, and non-strings —
is denied.

| Role | Quick PIN eligible | Password required |
| --- | --- | --- |
| `FACILITY_ADMINISTRATOR` | No | Yes |
| `GM` | No | Yes |
| `MANAGER` | No | Yes |
| `SUPERVISOR` | No | Yes |
| `LEAD_TEAM_MEMBER` | Yes | No |
| `STAFF` | Yes | No |
| Unknown or malformed value | No | — |

### Enforcement points

| Path | Enforcement |
| --- | --- |
| `POST /api/auth/pin-login` | Role checked after the employee is matched and before any token is created. Failure is generic. |
| `setEmployeePinAction` | Refuses to issue a PIN to a password-required role. |
| `updateEmployeeProfileAction` | Clears `pinDigest` in the same statement that writes the new role. |
| `runEmployeeCsvImportAction` | Same clearing behavior on the import update path. |
| `clearEmployeePinAction` | Unchanged; removal is always allowed. |
| Employee creation, signup, GM roster backfill | No PIN is ever set at creation, so no additional check is required. |
| Legacy rows | Cleared by migration `20260804190100_clear_password_required_pins`. |

UI hiding is not relied upon anywhere; every check above runs on the server.

## Legacy PIN cleanup

`prisma/migrations/20260804190100_clear_password_required_pins/migration.sql` sets `pinDigest` to
`NULL` for every Employee whose `roleType` is one of the four password-required roles. It is a
single deterministic `UPDATE`, is a no-op on an empty database and on a database with no invalid
rows, touches no other column, and never reads or exports a prior value.

Verified against a disposable database seeded with one synthetic Employee per role, each carrying
an injected PIN digest:

- Rows cleared: **4** (`FACILITY_ADMINISTRATOR`, `GM`, `MANAGER`, `SUPERVISOR`).
- PIN-eligible rows still holding a PIN afterwards: **4** (unchanged).
- Password-required rows still holding a PIN afterwards: **0**.
- Second application clears **0** rows.

The existing local `ltc_manager` database was not migrated or modified during this work.

### Role-transition behavior

| Transition | Behavior |
| --- | --- |
| PIN-eligible to password-required | `pinDigest` cleared in the same `UPDATE` as the role. |
| Password-required to password-required | Cleared if legacy data left a digest behind. |
| Password-required to PIN-eligible | No PIN is created; one must be issued through the normal workflow. |
| PIN-eligible to PIN-eligible | Existing PIN is preserved. |

Atomicity comes from the shape of the write: role and `pinDigest` are columns of one
`tx.employee.update`, so a promotion cannot commit while leaving a usable PIN. The surrounding
transaction also covers the audit entry — a forced audit failure rolls the role change back, which
is verified at runtime.

## Rate-limit design

Durable throttling lives in `src/lib/auth-rate-limit/` and is backed by the application's own
Postgres database. No external service was introduced, since no deployment provider is selected
yet.

### Bucket types

| Bucket | Protects against | Threshold | Window | Lock |
| --- | --- | --- | --- | --- |
| `PASSWORD_ACCOUNT` | Repeated password attempts against one normalized account. | 10 | 15 min | 15 min |
| `PIN_CANDIDATE` | Repeated attempts using the same PIN value at one facility. | 5 | 15 min | 30 min |
| `PIN_FACILITY` | Broad PIN enumeration across many candidate values at one facility. | 30 | 15 min | 15 min |

Thresholds live in `src/lib/auth-rate-limit/config.ts`. No numeric limit appears in a route
handler. Tests tighten thresholds through an injected `policyOverrides` argument rather than by
lowering production values.

`PIN_CANDIDATE` is the tightest bucket because a six-digit PIN has a small keyspace and this is the
bucket an attacker hits when retrying one value. `PIN_FACILITY` is the backstop that catches an
attacker rotating candidates to stay under the per-candidate threshold.

### Key privacy design

Bucket keys are HMAC-SHA256 digests under `AUTH_SECRET`, computed in
`src/lib/auth-rate-limit/keys.ts` over a null-separated tuple of a literal prefix, a key version,
the bucket type, and the identifying material:

- `PASSWORD_ACCOUNT` — normalized (trimmed, lowercased) email address.
- `PIN_CANDIDATE` — facility id and the submitted PIN.
- `PIN_FACILITY` — facility id.

No row stores an email address, a PIN, a password, a session cookie, or an IP address. Because the
HMAC secret is server-controlled, the small PIN keyspace cannot be precomputed offline from the
stored keys. The bucket type is part of the hashed material, so identical input material cannot
collide across purposes. The key version allows the derivation to change later; superseded buckets
age out through normal cleanup.

### Window, lock, and reset behavior

Each bucket keeps a `windowStartedAt` and an `attemptCount`. A failure inside the window increments
the count; a failure after the window elapses restarts the count at one. Reaching the threshold
sets `lockedUntil`, and authentication is refused until that instant passes. Locks recover
automatically; there is no manual unlock step.

A successful login clears only the narrow bucket the credential owns — the account bucket for
password login, the candidate bucket for PIN login. `PIN_FACILITY` is deliberately never cleared on
success, so one valid login cannot erase evidence of concurrent guessing at the same facility.

### Concurrency behavior

Each increment is a single `INSERT ... ON CONFLICT ("bucketKey") DO UPDATE`. Concurrent requests
serialize on the Postgres row lock, so no increment is lost and the threshold cannot be overrun by
racing. A test fires twenty concurrent failures at a bucket with a threshold of five and asserts
the count is exactly twenty and the bucket is locked.

Timestamps bound into these statements are converted explicitly to UTC. Raw parameters are
otherwise serialized in the host's local zone while the column is read back as UTC, which would
make lock arithmetic and `Retry-After` depend on where the process runs. A regression test asserts
that `lockedUntil` lands the configured distance ahead of real time.

### Denial response

A throttled request receives HTTP 429, the generic body `Too many attempts. Try again later.`, and
a `Retry-After` header in seconds, capped at 900 so a long lock does not disclose the exact
configured duration. Counter state is never returned.

### Cleanup

`cleanupAuthRateLimitBuckets` deletes buckets whose `lastAttemptAt` is older than the 24-hour
retention horizon and that are not currently locked, so cleanup can never cut an active lock short.
The `AuthRateLimitBucket_lastAttemptAt_idx` index supports the sweep.

**Known limitation:** no scheduler invokes this function yet. Until one exists, the table grows
with distinct bucket keys. Growth is bounded in practice by the number of distinct accounts,
facilities, and attempted PIN values, and every row is small and opaque. Scheduling belongs with
the deployment work that is out of scope here.

## Login handler behavior

### Password login (`POST /api/auth/login`)

The account identifier is normalized before hashing into a bucket key, so casing and surrounding
whitespace cannot split the bucket. The limit is evaluated before the bcrypt comparison, so a
locked account cannot be used to burn CPU. Unknown and disabled accounts run a bcrypt comparison
against a fixed placeholder hash and record a failure, so response timing and response content do
not distinguish an unknown address from a wrong password. Every invalid attempt returns the same
generic `Invalid credentials.` body.

### Quick PIN login (`POST /api/auth/pin-login`)

Both the candidate and facility buckets are evaluated before lookup and both record a failure on
any authentication failure. A correct PIN belonging to a password-required role is treated exactly
like a wrong PIN: same status, same body, same limiter consequence, and no session cookie. Active
employee status and facility scope continue to be enforced.

The previous in-memory limiter, `src/lib/pin-rate-limit.ts`, was deleted rather than left alongside
the new one. `X-Forwarded-For` no longer influences throttling at all; it survives only as a
diagnostic label on the pre-existing `KioskUnitPinLoginEvent` record.

## Session authentication method

`createSessionToken` now writes an `authMethod` claim of `PASSWORD` or `QUICK_PIN`, and
`verifySessionToken` exposes it on the session payload.

**Backward compatibility:** cookies issued before this change carry no `authMethod`. Those sessions
are read as `PASSWORD` when `authKind` is `user` and `QUICK_PIN` when `authKind` is `employee`,
which matches how each kind was always created. Existing sessions therefore remain valid across
this release, and an unrecognized claim value falls back to the same rule rather than failing open
to a privileged interpretation.

The claim records provenance only. It grants no authority, and authorization continues to derive
from the verified role and the employee's relationships. No route access changed.

## Audit behavior

Security-relevant outcomes are recorded through the existing `EmployeeHrAuditLog` mechanism:

| Event | `fieldKey` | Recorded values |
| --- | --- | --- |
| PIN rejected because the role requires a password | `auth.quickPin.rejectedPasswordRequiredRole` | The employee's own role, and `rejected`. |
| PIN cleared by a role promotion | `employee.pinDigest` | `set` to `unset (role now requires email/password: <role>)`. |
| PIN issued or cleared administratively | `employee.pinDigest` | `set` / `unset` (pre-existing behavior, unchanged). |

No raw PIN, PIN digest, password, password hash, session token, cookie, or request header is
written to any audit or rate-limit record.

**Deferred gap:** rate-limit activation is not written to an audit table. The
`AuthRateLimitBucket` row itself carries the aggregate evidence — bucket type, attempt count,
window start, lock expiry, and last attempt — which was preferred over creating an unbounded
attempt-history table for logging. Per-attempt security events belong to the future platform audit
system.

## Automated tests

| Area | File | Runs by default |
| --- | --- | --- |
| Credential policy across all roles plus unknown input | `src/lib/credential-policy.test.ts` | Yes |
| Role-transition PIN invalidation | `src/lib/employee-pin-invalidation.test.ts` | Yes |
| Bucket-key opacity and normalization | `src/lib/auth-rate-limit/keys.test.ts` | Yes |
| Limiter behavior against real SQL | `src/lib/auth-rate-limit/auth-rate-limit.test.ts` | Only with a database |

The limiter suite exercises the actual `ON CONFLICT` statement, so it needs Postgres. It skips
unless `AUTH_RATE_LIMIT_TEST_DATABASE_URL` points at a disposable migrated database, which keeps
`npm test` hermetic on a fresh clone. Point it only at a throwaway database: the suite deletes rows
from `AuthRateLimitBucket`.

## Runtime verification

All fifteen required HTTP scenarios were executed against a production build backed by a disposable
database with synthetic users and employees, and all passed. Coverage included eligible PIN login
with a `QUICK_PIN` session, rejection of valid legacy PINs for all four password-required roles,
429 under PIN guessing with a fixed header, with a rotating header, and with cookies cleared each
attempt, 429 under password guessing with and without header rotation, indistinguishable responses
for unknown and known emails, recovery after lock expiry, facility isolation, and loss of a PIN
after promotion.

The disposable database was dropped afterward. No credentials, PINs, cookies, or secret values were
printed during verification.

## Known limitations

- Rate-limit cleanup has no scheduler yet; see [Cleanup](#cleanup).
- A distributed attacker with many valid facility bindings can still consume each facility's
  budget independently. Facility-level isolation is intentional so one facility cannot lock out
  another.
- `PIN_FACILITY` locking is a shared resource: sustained guessing at a facility will briefly block
  legitimate PIN logins at that facility. This is the intended trade-off for a six-digit keyspace
  on shared devices, and it does not affect email/password login.
- There is no device-context bucket. A device cookie can be cleared, so it would add no protection
  the facility and candidate buckets do not already provide, and it would risk becoming a bypass if
  treated as identity.
- `Retry-After` is capped at 900 seconds, so a locked-out user may retry before the 30-minute
  candidate lock actually expires and receive another 429.

## Deferred work

Phase 1 explicitly does **not** resolve:

- Deployment-global permission tables
- Fail-open route authorization
- Unmatched-route behavior
- Servery milestone role authority
- Unit Workspace runtime error
- Cross-scope foreign-key findings
- Full session revocation (a session issued before a demotion remains valid until it expires)
- Continuous integration
- Offline continuity

This document records a security change. It does not certify the application for pilot or
operational use.
