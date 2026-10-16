# Phase 8.3 controlled pilot runbook — October 16, 2026

Gate A preparation only. **Production changes: NONE.** Every production action below requires explicit Gate B approval of the release candidate SHA, scope and date. This document is not deployment authorization.

## Scope and operational coverage

| Item | Approved proposal |
|---|---|
| Facility | Terrace View Long Term Care, **seeded facility `cmfacseed0000000000000001`** |
| Department | Dietary `cmu0hzhmb0001xw5kuu6vemum` |
| Future service date | **2026-10-20**, America/New_York; midnight EDT = 04:00 UTC |
| Wave A | Published `cooler_temperature_log` v1 and `opening_checklist` v1 only |
| Cooler target | Main Kitchen Walk-In Cooler `cmu0hzj080099xw5kbzizmy7x`, Central Kitchen `cmu0hzimp005uxw5ki1vhzqhm` |
| Checklist target | Main Kitchen space `cmubjns8x000fxwffbyomx9ri` |
| Non-pilot check | Plant `cmu0hzhmp0005xw5ka68b5f5u` remains LEGACY; no rollout changes |
| Excluded | Other same-name facility `cmsmjqvdx0002xwja2ifl9kjm`, EVS, every other department/facility |

Use new prospective attachment lineages, effective October 20. Preserve retired cooler attachment `c8dac3346ab859753c3239914`; do not reactivate or rewrite it. Preserve the cooler's Plant maintenance ownership. Dietary placement does not require changing asset ownership.

Proposed daily windows: Cooler Morning 07:00–09:00 and Afternoon 14:00–16:00; Opening Checklist 06:00–10:00. Expected scheduled requirements: **3 per service day**, before exceptions/rechecks. Use the published definitions' actual fields and rules; cooler v1 expects 33–41°F with corrective action outside range. Record observed values, never invented production readings.

Four legacy assignments remain configured: 1A Servery cooler, Central Kitchen walk-in cooler, 1A Servery hot/cold holding, Central Kitchen dishwasher. Read-only audit found **zero submissions across all seven selected Dietary legacy definitions**. This supports choosing the seeded facility for a controlled validation pilot; it does **not** prove these checks are unnecessary. The manager must confirm this scope is a seeded validation exercise, with no live holding/dishwasher/other cooler obligations being displaced. If any assignment is live required work, **STOP activation** and resolve full coverage before scheduling CANONICAL. There is no per-template legacy fallback inside canonical Dietary. Do not retire/delete assignments to manufacture readiness.

Wave B (Kitchen Sanitation Audit and Sanitizer Reading Log) is deferred until a reconciled Wave A day and separate expansion approval. Those definitions are not currently installed in this selected production facility. Do not publish/install extra templates merely to make the pilot larger.

If approval/preparation cannot finish before the proposed boundary, choose and explicitly approve a later future service date. Never backdate or begin mid-day.

## Responsibilities

| Owner | Responsibility |
|---|---|
| Release operator | Exact-SHA deployment, migrations, production configuration, checks and evidence log |
| Dietary manager | Confirm operational coverage, windows, targets and staff assignment; sign off reconciliation |
| Supervisor | Actual sign-in, Log Book, exceptions/rechecks and first submission supervision |
| Technical rollback owner | Available during cutover; own deployment/environment/rollout recovery and evidence preservation |

Assign actual people before activation. The facility administrator can serve as release approver/manager only after actual Dietary operational access is verified. Do not use Harbor/Console privileges for facility staff.

## Gate B sequence — only after explicit approval

1. Recheck production deployment, SHA, migration checksums, capability environment metadata, selected facility/department IDs, attachment history and rollout rows. Current rollback reference is deployment `dpl_HJs1Rs5pmKt9BkJJHWtF5eMx43o7`, SHA `e71b0484df683761ba8f7b594a47c45e2427e131`, URL `https://ltc-manager-746xo3f0o-adtrauts-projects.vercel.app`. If production changed, re-evaluate that rollback reference before proceeding. Keep secrets out of snapshots/output.
2. Verify recoverable database backups/PITR through the production database provider. Use the supported `prisma migrate deploy` path with production credentials supplied securely. Never `migrate dev`, `reset`, `db push` or a verification runner. Apply only the five migrations listed in the readiness report. Keep the capability gate OFF throughout migration.
3. The template-structure migration replaces an existing unique index and uses ordinary index creation. Use a quiet maintenance interval, check active evidence writers and long transactions, and bound lock/statement waits. Pause submissions for the brief migration interval if necessary; do not allow an unbounded lock queue. Stop on failure and inspect migration state before retrying. Do not edit migration files, mark failures resolved blindly, or reverse schema.
4. Build/deploy the **exact approved SHA** to project `prj_O3x1tS8yS1rFQEmd73rofZboIDCK`, team `team_djeRA5ZpmVTjCf6opbxfj6SS`. Verify the deployment SHA and READY status. Stage production without assigning domains where supported, perform non-mutating health/authentication checks, then promote that tested deployment. Do not test through this project's existing Preview credentials: Preview shares production resources.
5. Explicitly configure production `CANONICAL_LOGS_ENABLED=true` and deploy/promote a build containing that environment value. Keep the source default false. This makes configuration available; it does not create rollout decisions. Verify every department with no CANONICAL decision still resolves LEGACY.
6. As the authorized facility manager/admin, open `/build/logs`, `/build/logs?tab=library`, and `/build/logs?tab=attachments`. Verify Catalog, Library and Attached Logs. Verify STAFF cannot enter Build. For legacy departments, Run retains their existing Logs. Select the exact seeded Dietary context; facility-wide overview is not a rollout decision.
7. Perform the approved private Blob smoke: private put, authenticated read, unauthenticated denial, and PDF read of that private media. Use controlled non-user evidence, document object/record identifiers, and preserve evidence. Never make the store public or use local production disk as fallback. A configured token alone does not establish private-store/read/PDF health.
8. Verify the two existing catalog installs and their published versions. Create exactly the two prospective attachments above with the approved windows/date. Check active lineage overlap and target membership. Do not touch legacy assignments/history or other departments.
9. Through existing employee/account management, provision/reset a dedicated Dietary STAFF PIN and actual supervisor access securely. The selected facility currently has one active STAFF and one active SUPERVISOR employee, neither with a PIN; only a facility-administrator password grant was found. Do not assume an employee row is a working sign-in. Test actual STAFF, supervisor and manager sessions, scoped access and Review.
10. Run prospective Wave A preflight for the approved date using actual attachments, scope, staff access and rollout proposal. Require Cooler + Checklist coverage, no setup errors, no duplicate lineage, valid access and resolved legacy coverage. The current-day Record-engine panel will continue showing the current LEGACY day until the future boundary; full four-template acceptance can still be checked explicitly. Do not treat a current-day status as proof of future readiness.
11. In Build → Dietary department → Record engine, save **CANONICAL effective 2026-10-20** only after the above checks pass. Verify the saved decision and recompute prospective readiness: **PILOT_READY**. If preflight fails, halt; keep capability OFF through that date and append a later LEGACY decision rather than overriding blockers. Leave Plant and other departments untouched.
12. Before October 20 verify Dietary = LEGACY, no premature canonical due work, and existing legacy work remains functional. Enabling capability by itself must not switch authority.

## Start of day and first record

Before staff begin on the effective date, the release operator and supervisor must verify all of:

- Resolver: selected Dietary = CANONICAL, selected Plant = LEGACY; other same-name facility unchanged.
- Authorized Build → Logs opens; STAFF Build is denied.
- Exactly two scheduled cooler requirements and one checklist requirement exist for the approved targets/windows.
- Actual STAFF PIN login and due-form authorization work; supervisor Log Book and manager Review load.
- Private media smoke is healthy if the enabled workflow requires media.
- Legacy writers are fenced within selected Dietary/date; non-pilot Plant's previous template/PM/WO paths work.

Any core failure stops the pilot. For the first approved low-risk cooler requirement, supervise an actual measured reading. Immediately verify the OER's facility, department, attachment/version, requirement key, service date and value. Verify the same completion in Run/Log Book/Review, and **no LogSubmission, InspectionSubmission or OperationalTemplate-backed pilot evidence write**. Continue only after this check. Do not fabricate an exception to demonstrate functionality on live required work.

## Monitoring and end of day

Use existing application logs and scoped data; no new telemetry system. The supervisor tracks expected/completed requirements, overdue/missed/waived work, exceptions, rechecks, submit/authentication/media failures and legacy-write counts. The release operator checks non-pilot Plant and duplicate authority after the first record and after any incident. Record only operational identifiers/counts, not credentials or unnecessary personal data.

At day end reconcile the same facility, department and service date across **Run, Log Book, Review, PDF, XLSX and CSV**. Count scheduled expectations separately from follow-up rechecks; do not increase expected scheduled work for a recheck. Report expected, completed, exceptions, overdue, missed, waived and rechecks. Require pilot LogSubmission writes = 0, InspectionSubmission writes = 0, and OperationalTemplate-backed pilot evidence = 0. Preserve all pre-cutover history. Wave A cannot be declared complete until these comparisons agree or a documented incident has been resolved.

## Rollback and emergency response

1. **Contain:** supervisor stops affected submissions, records the incident/time and communicates a deliberate operational handoff. There is no silent per-submission fallback or dual-write. Non-pilot interference, wrong requirements, persistence/authentication failure, or required-media failure triggers a stop.
2. **Record engine:** while the capable deployment is healthy, append a LEGACY decision for selected Dietary at the next safe service-date boundary. For an October 20 pilot the normal rollback boundary is **2026-10-21 00:00 America/New_York (04:00 UTC)**. Verify October 20 remains canonical history, October 21 resolves LEGACY, and Plant stays LEGACY. Never delete the CANONICAL decision or rewrite previous evidence. A saved decision cannot be overwritten on the same service date. To abort an unstarted cutover, keep the capability gate OFF through that date, append LEGACY for a later boundary, and verify resolution before re-enabling capability. Never assume that saving an earlier LEGACY row cancels a later CANONICAL row.
3. **Environment kill switch:** if containment cannot wait, explicitly set production `CANONICAL_LOGS_ENABLED=false`, build/redeploy and promote with the new value. An environment edit alone does not modify an already-built deployment. This disables capability deployment-wide and restores LEGACY resolution; pause staff during the handoff so a service day is not accidentally split across writers. Document any deliberate emergency mid-day authority change. Stored rollout history and OERs remain intact.
4. **Application rollback:** restore the captured prior deployment with `vercel rollback https://ltc-manager-746xo3f0o-adtrauts-projects.vercel.app --scope adtrauts-projects` from the verified production project context. Check current reference immediately beforehand. That captured artifact had no capability flag and will hide Build → Logs; verify effective environment/engine after rollback. Rollback disables automatic production assignment until an explicit later promotion. Keep submissions paused until authentication and the selected authority are verified. Previous-build report/media defects can reappear; evidence remains stored.
5. **Evidence and schema:** keep all OERs, media, LogSubmissions, InspectionSubmissions, previous template evidence and rollout rows. The five forward migrations remain applied. No destructive database rollback is required; use a separately reviewed forward repair for an exceptional schema defect. Do not run a database reset or delete evidence to make counts match.

Blob outage: fail media-required submissions clearly and pause that workflow; no local disk fallback. Reporting-only outage: preserve frontline submissions if persistence, authority and access are healthy; hold reconciliation/expansion and repair reports. Authentication failure: stop affected users; a department-wide or shared-login failure pauses the pilot. Staff cannot submit/wrong requirements/duplicate authority/non-pilot effects: stop, contain and use the deliberate rollback procedure.

## Completion handoff

Return approved SHA/deployment, actual Build → Logs paths tested, scope/date, first OER identifier and zero legacy writes, reconciled counts/reports, private-media result, non-pilot Plant result, incidents and rollback result. Choose CONTINUE CONTROLLED PILOT, PAUSE PILOT AND ROLLBACK, or PILOT COMPLETE — READY TO PLAN BROADER CANONICAL MIGRATION. No global engine flip or historical migration is authorized.
