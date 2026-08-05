# Authorization Integrity — Phase 4

**Date:** 2026-08-05
**Branch:** `security/authorization-integrity-phase-4-2026-08-05`
**Base:** `security/runtime-hardening-phase-3-2026-08-04` @ `3abcb1cdae628e6d29a91857ce9d9b4f39807340`

Two live authorization-integrity findings are closed here: sessions that outlived the authority
they were issued under, and submitted foreign keys that were connected without checking scope.

## 1. Original findings

### Stale session authority

A session token is a signed JWT with a twelve-hour lifetime. `getSession` verified the signature
and nothing else, and the proxy did the same. Every authorization decision in the product then read
`role`, `facilityId`, and `primaryDepartmentId` out of that token.

The consequence: a signature stayed valid for twelve hours no matter what happened to the person
holding it. A terminated employee kept working. A demoted manager kept a manager's session. A
password reset issued after a credential was shared did not end the session established with the
old one. Phase 1 stopped new high-authority PIN sessions from being created and cleared PINs during
promotion, but it could not reach a session that already existed.

### Cross-scope foreign-key acceptance

Three exported Server Actions took an object id from `FormData` and connected it without confirming
it belonged to the caller's facility:

| Action | Field | State before |
| --- | --- | --- |
| `createRepairAction` | `vendorId` | No lookup at all. `unitId` and `assetId` beside it were both scoped. |
| `editAssignmentAction` | `operationInstanceId` | No lookup at all. `unitId` beside it was scoped. |
| `reassignAction` | `operationInstanceId`, `unitId` | Neither was checked. |

Operational Assignments are switched off behind a feature flag, but the flag gates the actions'
entry, not their reachability as exported endpoints, and a disabled interface does not make a
posted form safe. `createRepairAction` is not gated at all.

Two vendor pickers (`/repairs`, `/assets`) also listed every vendor in the database with no facility
filter, which both disclosed other facilities' vendor names and handed out the ids the action was
accepting.

## 2. Session-revocation design

### What was built

A `sessionVersion` integer on `User` and on `Employee`, defaulting to `0`. The value at issuance is
carried in the token as the `sessionVersion` claim. Every protected request compares the claim
against the row. A mismatch ends the session.

Revoking is an increment. Nothing else has to happen.

### Why this design for Version 1

The alternative is a session table with one row per live session, which is what "revoke a session"
usually means. That was rejected:

- It stores session state the product does not otherwise need, and the brief forbids storing raw
  tokens or cookies — so the table would hold a derived identifier that still has to be kept secret.
- It needs a cleanup story for expired rows, which is a scheduled job the product does not have.
- It answers the same question a counter answers, at higher cost: the request already loads the
  identity, so comparing one integer is free, while a session table is an extra indexed lookup plus
  a write on every login.

Two counters rather than one shared table because the two session kinds key to different rows. A
password session's `uid` is a `User.id`; a PIN session's `uid` is an `Employee.id`, and a PIN
identity frequently has no `User` row at all. Putting the counter on each identity means the
comparison never needs a join or a discriminator.

The initial value is `0` for new rows and backfilled as `0` for existing ones, so a row that
predates revocation is indistinguishable from a fresh one and no code has to special-case it.

No index was added. Both columns are read only through a primary-key lookup the request already
performs and written only by primary key, so an index would be maintained and never used.

### User versus Employee sessions

| | Password session | PIN session |
| --- | --- | --- |
| `authKind` | `user` | `employee` |
| `uid` | `User.id` | `Employee.id` |
| Version source | `User.sessionVersion` | `Employee.sessionVersion` |
| Identity check | `User.isActive` | `Employee.status !== TERMINATED` |
| Facility check | home facility or an active `UserFacilityAccess` grant | `Employee.facilityId` |
| Department check | `User.primaryDepartmentId` | `Employee.primaryDepartmentId` + `EmployeeDepartment` |

An employee promoted into a leadership role has both identities. Administrative revocation ends
both, because ending only one would leave the other usable.

### JWT claim

`createSessionToken` now requires `sessionVersion`. Making it required rather than optional was
deliberate: the type error enumerated all six issuance sites, so none could be missed.

`verifySessionToken` leaves the field `undefined` when absent rather than defaulting it to `0`, so a
pre-Phase-4 token is distinguishable from one legitimately issued at version zero.

### Backward compatibility

**A token minted before this release is refused.** It carries no version claim, so it cannot be
compared against anything, and treating "unknown" as "current" would preserve exactly the sessions
that cannot be vouched for. Holders sign in once at deploy. This is the documented
`VERSION_CLAIM_MISSING` behavior and it is covered by a test.

### Caching behavior

`getSession` is called many times while rendering a page — layout, page, and several panels — so
validating on each call would multiply one lookup into a dozen. Validation is memoized with React's
`cache`, which is per-request and discarded when the request ends.

There is deliberately **no process-global cache**. A process-wide cache would delay revocation by
its own lifetime, which is the defect this phase exists to remove.

## 3. Revocation trigger matrix

| Change | Password session | PIN session | Transaction | Audit |
| --- | --- | --- | --- | --- |
| Password changed (`changeOwnPasswordAction`) | Revoked | n/a | Same transaction as the hash write | `password_change_success` log |
| Quick PIN set or changed (`setEmployeePinAction`) | n/a | Revoked | Same transaction as the digest write | `employee.sessionRevocation` |
| Quick PIN removed (`clearEmployeePinAction`) | n/a | Revoked | Same transaction | `employee.sessionRevocation` |
| Employee role changed (`updateEmployeeProfileAction`) | n/a | Revoked | Same transaction | `employee.sessionRevocation` |
| Employee terminated (profile or status action) | n/a | Revoked, and refused on status independently | Same transaction | `employee.sessionRevocation` |
| PIN cleared by promotion (Phase 1 rule) | n/a | Revoked | Same transaction | `employee.sessionRevocation` |
| Facility access revoked (`revokeUserFacilityAccess`) | Revoked | n/a | Caller's transaction | `facility_access.revoked` |
| User deactivated | Refused on `isActive` | n/a | — | existing behavior |
| Administrative revoke (`revokeEmployeeSessionsAction`) | Revoked if linked | Revoked | One transaction | `employee.sessionRevocation` |
| Full logout (`/api/auth/logout-full`) | Revoked | Revoked | Single update | — |

Termination and deactivation are enforced **twice**: by the version increment, and by a direct
status check at request time. A code path that changes status without remembering to revoke still
cannot leave the session usable.

### Intentionally non-revoking

Signing people out is disruptive on a shared tablet mid-shift, and doing it for a corrected phone
number would train operators to expect spurious sign-outs. These do not revoke:

- Display name, first/last name, phone, email
- Employment type, job title, hire date, birth month/day, shirt size, HR notes
- Union membership, on-leave flag
- Primary unit, work stations, default assignment, discipline points
- **`EmployeeStatus.OFF`**, and returns from `OFF` to `ACTIVE`

`OFF` means off shift, not deactivated. Phase 3 established that an employee covering an unscheduled
shift keeps their operational authority; revoking here would create the opposite defect. Only
`TERMINATED` ends a session.

- Issuing a **first** PIN does not revoke, because no PIN session existed to end.
- Assignment changes do not revoke, because the session embeds no assignment authority.

## 4. Request-time enforcement

Two enforcement points, both reading the same validator:

**`src/proxy.ts`** — runs on every matched request, already in the Node runtime with Prisma access.
Covers pages and API routes. A rejected session gets a login redirect (pages) or a 401 (APIs), and
the cookie is deleted.

**`getSession` in `src/lib/auth.ts`** — the single chokepoint all 42 calling modules reach, covering
pages, API routes, and Server Actions alike. A rejected session returns `null`, so
`requireFacilitySession` throws before any protected read or write. A Server Action therefore fails
safely even on a path that never passed through the proxy.

Rejection reasons: `IDENTITY_NOT_FOUND`, `IDENTITY_INACTIVE`, `VERSION_CLAIM_MISSING`,
`VERSION_STALE`, `FACILITY_ACCESS_REVOKED`.

Department authority is handled differently on purpose. A removed department membership **drops the
claim** rather than ending the session: the person still works here, they just no longer carry that
department's authority. Both enforcement points overwrite `primaryDepartmentId` with the validated
value before any caller reads it.

## 5. Administrative revocation

`revokeEmployeeSessionsAction` ends every session for a managed employee.

- Minimum role `MANAGER`, matching `updateEmployeeStatusAction` — someone who can terminate an
  employee can already end their access, so requiring more here would leave the weaker control as
  the easier path.
- Below `GM`, the actor must share a department with the target, so a department manager cannot
  sign out unrelated staff.
- The lookup is scoped to the session facility. Another facility's employee resolves to nothing and
  is reported as **not found**, not forbidden, so the action cannot be used to probe for identities.
- Insufficient role and out-of-scope target produce different messages only for role, which the
  caller already knows about themselves.

`/api/auth/logout-full` revokes the caller's own sessions. A tablet handed back to the facility
should not leave a usable session behind on another device.

## 6. Vendor ownership conclusion

**Vendor is Facility-scoped.** This is read from the schema, not assumed:

```prisma
model Vendor {
  facilityId  String
  facility    Facility @relation(fields: [facilityId], references: [id], onDelete: Restrict)
  @@unique([facilityId, name])
  @@index([facilityId])
}
```

`facilityId` is required, not nullable. The unique constraint is per facility, so two facilities may
each have a vendor named "Acme". There is no `organizationId` and no global flag. `Vendor` has no
`isActive` or status field, so eligibility is ownership alone.

The rest of the product already agreed: `createAssetAction` and `updateAssetAction` both resolve a
vendor with `findFirst({ where: { id, facilityId: session.facilityId } })` before connecting it.
`createRepairAction` was the outlier, not the rule, so the fix matches the established in-file
pattern rather than introducing a new one.

Fixed:

- `createRepairAction` resolves the vendor within the session facility before connecting it, and
  reports "Vendor not found." for both a nonexistent and a forbidden id.
- `/repairs` and `/assets` vendor pickers now filter by `facilityId`.

## 7. OperationInstance and Unit validation

`src/lib/staffing/assignment-references.ts` holds one validator used by all three assignment
actions. `OperationInstance` carries `facilityId`, `departmentId`, and `serviceDate` as direct
columns, so every dimension is checkable without a join.

| Check | Rejection |
| --- | --- |
| Unit in session facility | `UNIT_NOT_FOUND` |
| OperationInstance in session facility | `OPERATION_NOT_FOUND` |
| Operation department matches the assignment's | `OPERATION_DEPARTMENT_MISMATCH` |
| Operation service date matches the assignment's | `OPERATION_DATE_MISMATCH` |
| Unit's declared departments include the operation's | `UNIT_OPERATION_MISMATCH` |

All three operation rejections render as the identical string "Operation not found.", so the caller
cannot tell an id that does not exist from one that exists in a facility or department they cannot
see. A test asserts the wording stays uniform.

Two deliberate limits:

**Units carry department responsibilities, not a department column.** Coherence reads
`UnitDepartmentResponsibility`. A unit that declares none is treated as unrestricted, which is how
the rest of the product reads a legacy unit — a missing declaration is absence of evidence, not
evidence of exclusion. Inventing ownership the schema never recorded would break existing data.

**The service date is compared as a `YYYY-MM-DD` string.** The two callers hold it in different
forms: one has the submitted string, the other a stored `@db.Date`. The actions construct dates with
`new Date(\`${key}T00:00:00\`)`, which is local midnight and lands on the previous UTC day at
positive offsets. Normalizing to a key at the boundary makes the comparison independent of that. The
existing date construction was left alone as out of scope; it is listed under remaining findings.

`editAssignmentAction` validates the unit and operation as the **pair they will become**, not one at
a time, so an edit that changes only the operation still has to agree with the unit already on the
assignment. `reassignAction` validates **before** its replace branch cancels anything, so a rejected
reference cannot leave the previous assignment cancelled with no replacement.

Neither the feature flag nor the disabled UI was changed. Assignments remain off.

## 8. Transaction and audit integrity

Every revocation that accompanies an authority change runs in that change's transaction. Both
directions are tested:

- A transaction that increments the version and then fails rolls the increment back, so the session
  the caller still holds stays valid rather than being half-revoked by a change that never
  committed.
- A transaction whose revocation fails rolls the authority change back with it, so a role change
  cannot commit while its sessions stay live.

Revocation is `{ increment: 1 }`, never an assignment. Eight concurrent revocations produce eight
increments; none can lower the version or restore a session another ended. Repeated revocation is
safe and always moves forward.

Audit records name the reason and never a token, cookie, PIN, or hash. A test asserts the audit
strings contain no long digit runs and no credential vocabulary.

Object-scope validation happens **before** any mutation in all three actions.

## 9. Migration

`prisma/migrations/20260805120000_session_revocation_version/migration.sql`

```sql
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Employee" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
```

Additive, safe against existing data, deterministic, safe on an empty database, no historical
deletion, no session data. Verified with `prisma migrate diff` against a shadow database: no drift
between the migration and the schema. Applied to a disposable database — 63 migrations, seed
succeeded, every user and employee at version 0.

The existing local `ltc_manager` database was not touched.

## 10. Tests

Fifty new tests. Total moved from 1,265 to 1,315 with zero failures.

**`src/lib/session-revocation/triggers.test.ts`** — 15 pure tests of the trigger policy. Role
changes in both directions, termination, re-editing an already-terminated employee, `OFF` in both
directions, PIN removal versus first issuance, multi-change edits, user role and activation, and
audit text hygiene.

**`src/lib/session-revocation/session-version.test.ts`** — 23 SQL-backed tests. Password session
before and after password change, role change, deactivation, facility-access removal and grant
restore, deleted user. PIN session before and after PIN reset, PIN removal, termination, `OFF`,
cross-facility use, department removal, deleted employee. Missing version claim, new session after
revocation, repeated revocation, eight concurrent revocations, both transaction-failure directions,
bulk revocation.

**`src/lib/staffing/assignment-references.test.ts`** — 12 SQL-backed tests across two facilities.
Cross-facility and cross-department operations, mismatched service dates, cross-facility units,
incoherent unit/operation pairs, legacy units with no declared responsibilities, in-scope
acceptance, indistinguishable rejection wording, vendor scoping, and vendor picker filtering.

SQL-backed suites are opt-in via `SESSION_REVOCATION_TEST_DATABASE_URL` and
`OBJECT_SCOPE_TEST_DATABASE_URL`, matching the Phase 3 pattern, so `npm test` stays hermetic on a
fresh clone. No Phase 4 test is permanently skipped.

Regression coverage confirmed intact: Phase 1 rate limiting and Quick PIN restrictions, Phase 2
route registry and Access Matrix, Phase 3 milestone authority and Unit Workspace.

## 11. Runtime verification

Sixteen scenarios against a production build on a disposable database, over real HTTP.
All sixteen **PASS**. Harness: `scripts/p4-runtime-verify.mjs`.

Scenarios 6 and 9 return a redirect to the unit workspace rather than a 200, which is the PIN
session being accepted and routed to its own home — the opposite of a login bounce.

No credential, token, cookie, PIN, or connection string is printed by the harness.

## 12. Known limitations

- **Pre-Phase-4 tokens are refused.** Everyone signs in once at deploy. Deliberate; see §2.
- **A password change signs the caller out of their own current session.** They re-authenticate with
  the password they just set. Acceptable, and arguably correct, but it is a behavior change.
- **Facility-access removal is caught by request-time validation as well as by an increment.** The
  increment is belt-and-braces; the validation is what makes the guarantee hold if a future code
  path removes a grant without revoking.
- **Unit/operation coherence is skipped for units with no declared department responsibilities.**
  Correct given the data, but weaker than it will be once responsibilities are universal.
- **The version is a single counter per identity.** There is no way to revoke one device and leave
  another signed in. That needs a session inventory, which is deferred.

## 13. Not implemented in this phase

- Persistent session inventory
- User-facing device/session management dashboard
- Offline storage or synchronization
- Operational Assignment activation
- Supervisor Coverage
- Operations Engine
- Job Flow
- EVS
- CI
- Rate-limiter cleanup scheduling

## 14. Deferred findings

Carried forward, not fixed here:

- Rate-limiter bucket cleanup scheduling
- CI pipeline
- Offline continuity
- Operational Assignment activation, Supervisor Coverage, Operations Engine, Job Flow
- Correction timezone interpretation (Phase 3)
- Projection Unit Workspace controls (Phase 3)
- Log Book display of milestone history (Phase 3)
- Assignment actions construct `serviceDate` from local midnight rather than
  `facilityLocalDateToServiceDate`, which can land on the wrong UTC day at positive offsets. The
  Phase 4 validator sidesteps this by comparing date keys; the construction itself is untouched.
