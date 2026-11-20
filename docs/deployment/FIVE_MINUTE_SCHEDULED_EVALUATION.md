# Five-minute shared Scheduled Evaluation

Status: implementation draft, November 20, 2026. The owner completed Vercel Pro billing and approved preparing the recommended shared scheduler change, retaining the no-tests instruction and deferring the scanner server. Merge, any administrator exception, Production variable activation and promotion still need the exact candidate's explicit approval. Earlier one-time release approvals do not apply to this branch.

## Existing owners and schedule

This reuses Scheduled Evaluation, its existing `ScheduledEvaluationLease` rows, typed domain evaluators and durable continuation cursors. There is no new scheduler, queue, notification engine, data model or migration. `vercel.json` registers `/api/internal/scheduled-evaluation` with `*/5 * * * *`: 288 scheduled ticks per day. The existing daily Support automation and Plant preventive-maintenance schedules are unchanged. Actual usage depends on eligible work and is subject to Vercel billing.

The existing internal route continues to require exact Bearer `CRON_SECRET`; no Harbor/customer session grants access and callers cannot select a Facility. The new `SCHEDULED_EVALUATION_ENABLED` switch must be exactly `true` to run. Its code/example default is off. It offers a job-specific stop mechanism without disabling the two existing daily jobs. Vercel Cron registers on deployment and executes on Production, not on a branch Preview. A Ready Preview build does not activate the clock.

Read-only Vercel metadata confirmed that `ltc-manager` (`prj_O3x1tS8yS1rFQEmd73rofZboIDCK`, team `adtrauts-projects`) has a Production-only sensitive `CRON_SECRET` entry. Its value was neither decrypted nor printed. No hosted variable or job setting was changed during implementation. Do not replace the existing shared secret as part of this activation: it also protects the two daily jobs.

Registered order remains Coverage time boundaries, REQUIRED location Key Point overdue, Work Order overdue, notification responsibility reconciliation, acknowledgement escalation and external delivery/snooze expiry. Each domain continues to own its facts, due rules, entitlement/access decisions and existing pause exclusions. No new overdue policy, automatic email, staff invitation, recovery authority, suspension or assistance grant is introduced.

## Whole-pass limits and unfinished work

The internal route retains a 300-second platform maximum. The whole invocation has one cooperative four-minute budget, reserving 30 seconds for the existing notification outbox processor and leaving a further minute of platform headroom. Evaluators share their remaining time in registered order instead of each receiving a fresh four minutes. Deadline checks occur between record operations and atomic Coverage groups. This is cooperative: an in-flight query/transaction is allowed to finish; the clock is not a database cancellation mechanism or a hard timing guarantee during an infrastructure stall.

A lease on the existing `scheduled-evaluation.pass` row serializes whole cron passes. Existing per-evaluator leases and fenced checkpoint/health writes remain. A concurrent tick returns a skipped/already-running result without changing another owner's health. Health writes use the pass lease owner instead of an unfenced upsert. Lease expiry remains the recovery path after a process dies; no lock is forcibly stolen.

Partial scans retain the last actually handled record. A full page at the continuation cap retains its cursor instead of clearing it; a deadline before any progress retries the same Facility. Coverage advances only across a contiguous prefix of handled episode IDs because its atomic groups can contain non-contiguous IDs. Work Order checkpoints are now fenced and do not advance to the end of a fetched-but-unprocessed page. Existing idempotency and source transactions remain authoritative.

The cron drains up to 20 oldest pending rows through the existing notification processor, including rows created by a prior interrupted invocation. It does not process only the newest invocation's returned IDs. Pending rows for suspended Facilities are excluded. Processing stops between rows at the deadline, leaving the original durable row for another tick. A returned failed result counts as a failure, not a successful delivery. Remaining pending work or a partial/skipped evaluator produces incomplete health and HTTP 202, with `completed=false`, rather than advancing the pass's success time. Actual processing failures or lost lease ownership return HTTP 503. Neither status promises an immediate Vercel retry; the next scheduled tick resumes normally.

Web Push remains separately gated by `WEB_PUSH_SENDING_ENABLED`, default off; no VAPID key or sending flag is set here. In-app attention can be updated by this scheduler without enabling device delivery. The scanner server remains unprovisioned, its schedule is absent, and pending attachments remain unavailable under the existing guard. Staff invitations, independent recovery and assistance/grant issuance remain disabled.

## Database usage decision before activation

Read-only provider metadata confirms that the retained Neon organization `org-hidden-leaf-35421142` (Vercel: adtrauts' projects) is still on Free. Production endpoint `ep-icy-mode-avbj71pm` is fixed at 0.25 CU. A five-minute database polling interval can keep compute awake even with zero customer Facilities. At continuous 0.25 CU for 30 days, the planning estimate is 180 CU-hours/month, above the published Free allowance of 100 CU-hours per project. The Vercel Pro purchase did not upgrade this separate Neon plan.

At the published Neon Launch compute rate of $0.106/CU-hour, that Production-only continuous-compute scenario is about $19.08/month, before storage, restore history, additional branches and other active databases. This is an estimate, not a checkout quote or spending cap. [Neon plans](https://neon.com/docs/introduction/plans) and [scale to zero](https://neon.com/docs/introduction/scale-to-zero) explain the allowance and idle behavior. A longer cadence changes the accepted timing behavior and is not silently substituted.

No Neon plan, autosuspend setting, compute size or database binding has changed. Resolve the database usage/billing decision before enabling the cron. The code and Preview can be reviewed while the activation switch remains off.

## Compilation and release boundary

No tests, browser/app smoke, health probe, fixtures, manual evaluator/cron invocation, email, push, payment or database write is part of preparation. Compilation is allowed. Branch publication and the eventual merge title must include `[skip ci]`; skipped required checks are not passing checks. No repository-rule changes are proposed. No hosted migration is needed.

The release approval should cover the exact reviewed PR head, use of the existing administrator exception (required checks are intentionally skipped), setting `SCHEDULED_EVALUATION_ENABLED=true` for Production only, building the merged source and promoting only after the Production build is Ready. Do not set the flag on shared Preview or pilot settings. Retain the current compatible deployment. Promotion starts genuine scheduled operational writes, not a test; it can also update in-app notification recipients under existing policy. Push, scanning and the daily job cadences remain unchanged.

After activation, confirm the registered five-minute schedule and read its naturally generated provider logs/health metadata. Do not use Run, curl, browser navigation or a synthetic fixture as a substitute for the scheduled tick under the no-tests direction. Configuration evidence and observed natural execution must be distinguished.

For shutdown, turn only `SCHEDULED_EVALUATION_ENABLED` off and load that setting into a deployment, or release source with this one cron removed. Environment edits alone do not update an already deployed function snapshot. Do not disable all project cron jobs, because Support and maintenance must continue. Do not clear leases, checkpoints, notification rows or logout receipts. No destructive cleanup or database rollback is needed.
