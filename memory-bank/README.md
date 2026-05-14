# Memory Bank

This folder is the project memory bank for `ltc-manager`.

Use it to keep operational context so future sessions do not drift.

## Files

- `project-overview.md`: product scope, module map, and current MVP boundaries.
- `architecture-decisions.md`: key technical decisions and rationale.
- `progress-log.md`: phase-by-phase implementation history, quality gates, and notable post-phase fixes.
- `implementation-phases.md`: planned phases (facility through Phase E) and per-phase quality gates.
- `runbook.md`: local setup, DB, auth, provisioning (`db:provision` blank facility), PIN/tablet flow, troubleshooting.
- `session-notes.md`: dated summary of work sessions.
- `employee-hr-source-of-truth.md`: shipped vs backlog for employee roster, HR fields, discipline, terminations, audit, CSV import, and **Employees** area navigation/filters.
- `future-projects-ltc-ops-strategy.md`: LTC facility/dining typology vs complex multi-servery sites; contract vs self-op; **phased product strategy** (dining-first wedge, modular expansion); positioning and non-goals.

**Scripts (repo root `ltc-manager/`):** `scripts/provision-facility.mjs` — blank facility + GM user + GM employee PIN (env-driven); `npm run db:provision`. **`scripts/backfill-gm-employees-from-users.mjs`** — GM `User` rows missing a matching `Employee` by email; `npm run db:backfill-gm-roster`.

## Update Rule

After any meaningful feature set is completed, update:

1. `progress-log.md` (what changed + gate results; add a short “post-phase” note for important fixes after a phase closes)
2. `architecture-decisions.md` (if decisions changed)
3. `runbook.md` (if commands/setup/troubleshooting changed)
4. `implementation-phases.md` (check off completed deliverables when a phase is done)
5. `session-notes.md` (optional dated summary for the session)

