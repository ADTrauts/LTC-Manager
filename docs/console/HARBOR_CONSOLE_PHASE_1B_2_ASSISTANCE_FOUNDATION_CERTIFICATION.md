# Harbor Console Phase 1B.2 assistance foundation

Phase 1B.2 adds the storage and lifecycle needed for scoped Facility assistance. The feature is disabled in this slice. Normal Harbor sign-in issues unbound logins. No routes, APIs, Server Actions, navigation entries, grant writer, or Facility reader call the assistance store to open a session or access customer data. The legacy work-session shutdown remains in effect. [Facility assistance architecture](HARBOR_CONSOLE_PHASE_1B_FACILITY_ASSISTANCE_ARCHITECTURE.md)

## Authority and persistence

- A `HarborFacilityGrant` references one canonical `PlatformStaff` identity and one canonical `Facility`. It records an approver, finite validity, a bounded operation list, and revocation metadata. The only reserved operation key is `FACILITY_STRUCTURE_READ`. Reserving the key does not implement or enable its reader.
- A `HarborAssistanceSession` references one grant. Its purpose and end reason use structured codes. The start decision reuses Harbor signature and live staff checks, requires the exact Facility, and caps expiry at both grant and login expiry. A retry with the same per-login request identifier returns the same session only when its inputs match and the authority is still live. The resolved actor has no customer role or account identity.
- Start, end, revoke, and bound-login logout write lifecycle state and a `HarborAuditEvent` together. A linked audit detail carries grant/session references or a digest of the login identifier for logout, with no token or customer payload. A logout receipt blocks future starts for that login even if it had never started assistance. It must be retained until the login expires. Ordinary audit writes use the previous table shape.
- PostgreSQL transactions serialize on staff rows in ID order, then lock scoped grant and session rows. Read Committed lets an operation see changes committed while it waited. Decisions sample the database clock after lock acquisition. A future scoped reader must use the resolved actor and query its owned data in that same transaction. No customer data readers or backfills are part of this PR.

## Verification and rollout

The forward migration passed on an empty disposable baseline and on the prior schema with 11 synthetic rows. Their values matched before and after the upgrade, including a Facility, customer role period, staff row, historical audit event, room, Support ticket and published Catalog Record. The migration requires no backfill or existing data conversion. See the draft PR for the exact commit's hosted Verify and protected Preview results.

The disposable database tests exercise login and Facility isolation, unknown operations, live staff checks, start and revoke retries, expiration after a lock wait, revocation racing start, both logout/start orderings, rollback on a rejected audit write, and PostgreSQL checks on scope, time, and terminal state. Browser and route registry tests check that assistance endpoints remain unavailable.

There is no migration, test grant, or assistance session on staging or Production. A later release that uses the store requires the approved forward migration and rollout order. A rollback must preserve evidence and continue to deny legacy work-session authority.

## Owner decisions before enablement

Approve grant approval and revocation authority, single-owner and self-approval handling, grant and session maximums and renewals, customer consent and recording, audit access and retention, and whether one login may hold more than one active Facility context. Phase 1B.3 owns the Facility structure fields and side-effect-free projection. It must avoid the Facility Builder loader that backfills room data.
