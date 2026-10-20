# ONB-07 controlled-pilot handoff

Status: **PENDING — no live pilot authorized**. On October 18, 2026 the user confirmed that the Facility, workflow, customer owner, VSSYL delivery/support owner and training/support window remain undecided. Synthetic local demonstrations cannot satisfy customer acceptance. This checklist grants no deployment, live charge, customer-data operation, external message or activation permission.

## Named scope and authorization

| Required fact | Current record | Evidence needed before activation |
|---|---|---|
| Facility and canonical Facility ID | Pending selection | Customer-approved site and isolated scope; confirm Organization and timezone |
| Real workflow / Department Product | Pending selection | Chosen AVAILABLE Product, one useful workflow, locations, accountable performers and deliberate publication criteria |
| Second Department, if selected | Pending selection | Independent preparation; first Department's workflow must not depend on completion of the second |
| Customer accountable owner / publication approver | Pending designation | Named current authorized customer, acceptance responsibility and availability |
| VSSYL delivery / support owners | Pending designation | Named PlatformStaff, permitted work sessions, escalation coverage and handoff |
| Training and supported operating window | Pending scheduling | Date, timezone, attendees, trainer, support coverage and fallback rehearsal |
| Assistance engagement, if chosen | Pending scope | Approved deliverables/revision, separate service order or attributable Owner waiver, customer approval; no implied subscription exception |
| Live pilot authorization | None granted | Explicit authorization identifying permitted environment, actions, dates and scope |

## Preflight gates

- [ ] Review the current [certification](./ONB_07_CERTIFICATION_2026-10-18.md), [blockers](./ONB_07_RELEASE_BLOCKERS.md), tracker and actual candidate source/build fingerprints. Required CI gates must pass; a historical pass or synthetic journey is insufficient.
- [ ] Normally commit/review the complete onboarding index **and final working-tree overlays**, including **all ten program migrations / 150 total** listed in the [final-review handoff](./ONB_07_FINAL_REVIEW_HANDOFF_2026-10-19.md); run checksum/integrity governance against the intended target without editing applied SQL or resetting a database. Obtain target migration/backup/recovery approval separately.
- [ ] Verify the approved deployment, TLS/domain, authentication, environment flags, monitoring, retention and recovery arrangements. No rollout or public-signup launch approval is implied.
- [ ] If retained customer originals are in scope, separately authorize private Blob and ClamAV hosting/network, verified TLS/CA and token custody, engine/signature/image updates, on-call ownership and the support-specific PENDING processor schedule. Confirm production health, exact SHA/attempt binding and authorized staff-only download. Local engine proof does not pass this production gate.
- [ ] Resolve the final-review idle Facility-date boundary finding (R07-07) and verify date/lease locking preserves pending ciphertext. Earlier passing SPACE checks do not cover this newly reproduced edge.
- [ ] For canonical SPACE offline, provision dedicated `OFFLINE_RECOVERY_KEYS` / `OFFLINE_RECOVERY_ACTIVE_KEY`, HTTPS, rotation/retention and accountable recovery ownership. Keep prior key IDs while pending intent needs them. Apply migrations 149–150, regenerate clients and upgrade **every** canonical timing writer before enabling offline access; mixed old/new timing writers do not satisfy the parent-fence contract. Confirm fresh same-actor recovery in the intended environment.
- [ ] Confirm subscription/D09 access separately from assistance payment. Agree any service scope and fee before a separately authorized charge. Scheduling cancellation cannot override suspension or explicit revocation.
- [ ] Approve minimum necessary test/live data and access. Customer originals remain quarantined until a real supported scan succeeds; file custody never authorizes imports.

## Delivery and customer demonstration

- [ ] Confirm prefilled facts/timezone and enter with zero Departments if appropriate. Record actual entry time and interruptions.
- [ ] Select/license/install only approved AVAILABLE Products; verify retry and billing recovery. Do not release DEVELOPMENT Products or infer a free subscription from a service waiver.
- [ ] Customer or authorized staff maps the agreed files into shared CSV/XLSX plans. Review existing-account consent, canonical shared people/places, credentials/enrollment and all proposed relationships before confirmation.
- [ ] Capture actual committed/reused/blocked/failed/unknown receipts and executing User versus PlatformStaff. Reconcile interrupted requests before retry. Preserve deferred items and immutable approved scope/acceptance evidence.
- [ ] Prepare the chosen workflow in canonical Build tools. The customer deliberately approves/publishes it; an actual authorized employee performs it in Run. Verify the resulting historical record and that the unprepared second Department causes no dependency.
- [ ] Rehearse denied role/wrong Facility, pending enrollment, missing configuration, billing suspension/recovery and actionable support escalation using explicitly approved non-disruptive actions.
- [ ] Train customer owners, staff and shared-tablet operators. Record attendance, questions, corrections and support responsibility.
- [ ] Customer reviews delivered/deferred scope and actual receipts, demonstrates the chosen real workflow, and records acceptance with date and accountable approver. Service status is not operational readiness or publication authority.

## Success, effort and fallback record

No customer or staff effort measurements exist yet. Establish pilot targets from observed baseline and agreed workflow needs before acceptance; do not invent a setup-time promise.

| Measure | Pilot result / evidence |
|---|---|
| Time to confirmed site entry | Not measured |
| Time to first useful configuration | Not measured |
| Time to first customer-published and actually used workflow | Not measured |
| Import mapping corrections, retries and unknown-outcome reconciliation | Not measured |
| Abandonment or support escalations | Not measured |
| Customer active time, training and waiting time | Not measured |
| VSSYL mapping, configuration, training and support time | Not measured |
| Delivered scope, deferred work and customer acceptance | Pending |

Use existing onboarding telemetry, canonical receipt/audit timestamps and attributable service delivery evidence. Record the source, clock/timezone, start/end definitions and human active/waiting time separately. Synthetic Playwright duration is engineering evidence, not a customer/staff measurement.

Before activation, agree the site's existing operational fallback and when to invoke it. If a blocker occurs, stop new intake/publication or affected execution, preserve canonical records and paid orders, reconcile receipts/provider state, and escalate to the named owners. Feature rollback may disable new onboarding UI/intake; it must not delete identities, relationships, published configuration, operational history or payment evidence. Corrections are forward and attributable. Resume only after the appropriate customer and release owners accept the correction.

## Acceptance and release decision

- [ ] Required local and production gates passed with current evidence.
- [ ] Named real customer demonstrated the selected workflow and accepted delivered/deferred scope.
- [ ] Training/support/fallback and actual effort/findings recorded.
- [ ] Release owner records a separately authorized, bounded release decision and limitations.

Current verdict: **pilot acceptance pending; ONB-07 incomplete; no rollout approval**.
