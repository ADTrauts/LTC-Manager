# Legacy Retirement program

Written October 20, 2026. This program retires every legacy surface before Vssyl takes its first real customer. Every account today is a test account.

It uses `LEG-` identifiers. It is separate from the [Dashboard program](../dashboard/README.md) (`DSH-`), the [Contracted Department Authority program](../contracted-departments/README.md) (`CDA-`) and the [onboarding program](../onboarding/README.md) (`ONB-`). It starts from the [Legacy Surface Register](../product/LEGACY_SURFACE_REGISTER.md) and amends it phase by phase.

## What it means

- **One Records engine.**
  - The forward engine (Catalog → Attachment → Record) is the only one.
  - Legacy logs (`/logs`), legacy inspections (`/admin/inspections`) and the old template engine (`/staffing/templates`, `OperationalTemplate`) retire.
  - The per-Department engine switch and `CANONICAL_LOGS_ENABLED` go away.
- **Plant and EVS move too.**
  - Plant's preventive-maintenance and work-order Records move off the old template engine. Plant scope was approved for this change, and Plant stays AVAILABLE.
  - Vssyl publishes standard Plant and EVS forms first, because the new catalog has none today.
- **One schedule path.** The legacy unit grid (`/staffing/legacy`) retires. Call-offs and moves work on canonical shifts.
- **Food & Nutrition meal timing uses Key Points only.**
- **No legacy switches.**
  - Projection fallback flags are removed.
  - Dormant systems are removed: Task Sync, the Operation Engine tables, `ConsoleTicket`.
  - The `/issues` facade is removed.
- **Seeds create forward data only.**
- **Behavior first, tables later.** Legacy tables are dropped only in a separate phase, after row counts confirm test data only and with explicit approval.
- **Today's Work and Business Workspace** retire in the Dashboard program (DSH-04). This program waits for that.

## Program records

| Record | Purpose |
|---|---|
| [Current-state audit](./CURRENT_STATE_AUDIT_2026-10-20.md) | Every legacy surface today, with paths, flags and gaps |
| [Decisions](./DECISIONS.md) | Decisions (`LEG-D01`…), open items (`LEG-Q01`…) and the revision history |
| [Phased plan](./PHASED_PLAN.md) | LEG-00 through LEG-07, and order with the Dashboard and authority programs |
| [Phase tracker](./PHASE_TRACKER.md) | The single status and authorization record |

## Boundaries

- **Forward-only schema.** No applied migration is edited. No `prisma migrate reset`. Table drops need explicit approval.
- **No commercial side effects.** No change to release status, sellability, entitlements or billing.
- **Explicit scope where required.** Plant changes need Plant scope. Onboarding changes need ONB scope.
- **No parallel model.** No new template, requirement or evidence model.
- **Next.js 16.** Read the relevant guide in `node_modules/next/dist/docs/` before writing code.

## Glossary

| Term | Meaning |
|---|---|
| **Legacy surface** | A route, action, loader, flag, seed or table the register classes as legacy, compatibility, deprecated or dormant |
| **Forward engine** | The Records chain: Catalog definition → facility install → Attachment → derived requirement → `OperationalEvidenceRecord` |
| **Template engine** | `OperationalTemplate` (Phase 9C). A compatibility engine, not the Catalog. |
| **Retire behavior** | Remove routes, actions, readers, flags, seeds and tests. Tables stay unread. |
| **Schema cleanup** | Drop the unread tables (LEG-06), with explicit approval |
