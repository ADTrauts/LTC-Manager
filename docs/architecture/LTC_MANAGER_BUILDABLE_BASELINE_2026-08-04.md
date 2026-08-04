# LTC Manager — Buildable Baseline (2026-08-04)

This document records the first reproducible engineering baseline for LTC Manager.

**This baseline is not approved for pilot use and not approved for deployment.** It establishes
that the repository builds, type-checks, lints, tests, and migrates from a clean checkout.
It makes no security, correctness, or operational-readiness claim.

## Branches and commits

| Item | Value |
| --- | --- |
| Baseline branch | `baseline/reconciliation-2026-08-04` |
| Baseline commit | the single commit at the tip of that branch, `fix(baseline): establish reproducible LTC Manager baseline` (this document is part of that commit, so its own hash cannot appear inside it) |
| Safety branch | `safety/working-tree-2026-08-04` |
| Safety commit (baseline parent) | `8d321cf7cbaca4000363e9d489007468507435c5` |
| `main` at time of baseline | `704adc72abb46705a4451608a2fadf84215f42be` |
| `origin/main` at time of baseline | `6380b661a64e8f020d16813342945797a50bc0e0` |

The safety branch preserves the untouched working tree as it existed before any stabilization.
The baseline branch adds one commit on top of it containing only the stabilization diff.

## What the baseline commit contains

The commit is broad by design: it converts a preserved snapshot into a buildable state. Every
change falls into one of these categories:

- Build correction (module-graph blockers)
- Type correction (production types and test fixtures)
- Lint correction
- Test correction
- Deferred `/evs` route cleanup
- Secret redaction (already present in the safety commit)

There are **no schema changes, no migration changes, and no feature-flag changes**. The only
authorization-adjacent change is removal of the dead `/evs` route entry, described below.

## Validation

All commands were run with `NODE_ENV` unset. A `NODE_ENV=development` value in the developer
shell causes Next.js to load a development React build during a production build and fails
static generation of `/_global-error`.

| Command | Result |
| --- | --- |
| `npm test` | pass — 797 tests, 69 suites, 0 failures |
| `npm run typecheck` | pass — 0 errors |
| `npm run lint` | pass — 0 errors, 6 warnings |
| `npm run build` | pass — 59 route table rows (60 unique route paths) |
| `npx prisma validate` | pass |

## Clean-checkout reproducibility

The baseline content was verified in an isolated clone with no `.env`, no `node_modules`,
no `.next`, and no files copied from the working repository. From that clone:

- `npm ci` succeeded
- `npm test` — 797 tests, 69 suites, 0 failures
- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors, 6 warnings
- `npm run build` — 59 route table rows
- `npx prisma validate` — pass

## Disposable database verification

A throwaway database was created, migrated, and seeded from the clean checkout, then dropped.

| Check | Result |
| --- | --- |
| Migrations applied | 59 of 59 |
| Seed | succeeded |
| `Role` count | 6 |
| `FACILITY_ADMINISTRATOR` present | yes |
| `Department` count | 3 (Dietary, Environmental Services, Plant Operations) |
| Department tables | present |
| `AppRoute` count | 15 |
| `RoleRoutePermission` count | 90 |
| `/admin` permitted roles | `FACILITY_ADMINISTRATOR` only |
| `/evs` in `AppRoute` | absent |
| Nav-visible routes advertising `/evs` | none |

## EVS route deferral

The `/evs` page and its actions were removed because the page imported a Server Action
(`createEvsRepairTicketAction`) that does not exist, which blocked the production build. The
proposed action could not be safely mapped onto the existing Repair action without inventing
behavior, so the route was deferred rather than reimplemented.

Because the page no longer exists, this baseline also removes every reference that advertised
it, so the application does not offer a link to a 404:

- `prisma/seed.mjs` — `AppRoute` definition and minimum-role entry
- `src/lib/route-permissions.ts` — `WAVE1_ROUTE_MIN_ROLES` fallback entry
- `src/lib/nav-zones.ts` — zone path rule
- `src/lib/department-nav.ts` — EVS department navigation rule
- `src/lib/design-system/icons.ts` — nav icon mapping
- `src/lib/business-workspace/build-quick-actions.ts` — `evs-board` quick action
- `src/lib/business-workspace/workspace-composition.ts` — `evs-board` in the EVS quick-action set
- `src/lib/business-workspace/build-department-health.ts` — EVS health card now links to `/dashboard`
- `src/lib/business-workspace/projection/adapt-projection.ts` — `/evs` destination mapping and
  `evs-board` quick-action derivation
- `src/app/(protected)/units/actions.ts` — `revalidatePath("/evs")`

**This is deferred route cleanup, not removal of EVS capability.** The following remain intact
and available for a future EVS implementation:

- The EVS `Department` and its seed data
- Department enums and the department-responsibility architecture
  (`UnitDepartmentResponsibility`)
- The `RoomAreaStatus` model and related tables
- EVS readiness domain logic (`src/lib/readiness/evs-room-signals.ts`,
  `src/lib/readiness/profiles/evs-readiness-profile.ts`) and its tests
- Cross-department request routing

## Known limitations

### Lint warnings (6, all pre-existing)

All six are `@typescript-eslint/no-unused-vars` in code related to the disabled Assignments
feature and Experience contracts. None were introduced by the baseline.

| File | Symbol |
| --- | --- |
| `src/app/(protected)/employees/page.tsx` | `deptId` |
| `src/app/(protected)/staffing/assignments/actions.ts` | `statusValues` |
| `src/app/(protected)/staffing/assignments/page.tsx` | `AssignmentFulfillmentSummary` |
| `src/app/(protected)/staffing/assignments/page.tsx` | `editAssignmentAction` |
| `src/lib/experiences/contracts.ts` | `actionSections` |
| `src/lib/scheduling/operational-assignments/build-assignment-suggestions.ts` | `roleKey` |

### Schema drift

Minor differences exist between the schema produced by applying all migrations and
`prisma/schema.prisma` (index and default-value details). `prisma validate` passes. This drift
is recorded, not corrected, in this baseline.

### Local development database drift

The developer's local `ltc_manager` database is not a product of a clean seed and should not be
treated as authoritative. Repository intent is defined by a fresh migrate-and-seed, as verified
above. The local database is expected to diverge.

#### Unintended seed against `ltc_manager` during baseline verification (2026-08-04)

While verifying the clean checkout, `prisma db seed` ran against `ltc_manager` instead of the
disposable database. The cause was an exported `DATABASE_URL` left in the shell environment by an
earlier step; Prisma resolves real environment variables ahead of a project `.env` file. The
verification was afterward re-run correctly against the disposable database, and the results
recorded above come from that corrected run.

The seed is upsert-only. No rows were deleted, no migrations were applied, and no schema changed.
The additions were:

| Table | Before | After |
| --- | --- | --- |
| `AppRoute` | 12 | 15 |
| `RoleRoutePermission` | 70 | 90 |
| `Organization` | 2 | 3 |
| `Department` | 3 | 6 |

`Role`, `Facility`, `User`, `Employee`, `Unit`, `EmployeeDepartment`, and `UserFacilityAccess`
were unchanged.

The additions were deliberately retained rather than reverted. Two consequences matter for future
work: the local database no longer represents the pre-baseline "stale" state that the
authorization census measured, and any future comparison of seed intent against local state should
account for this event rather than treating the current counts as untouched development history.

### No continuous integration

The repository has no CI configuration. All validation described here was run manually. Nothing
enforces these checks on future commits.

## Known authorization findings

These were identified by the authorization census that preceded this baseline. **None are fixed
here.** They are the scope of the next authorized activity.

| Finding | Effect |
| --- | --- |
| Facility Administrator can log in via Quick PIN | PIN sessions inherit the employee's role without a ceiling, so a PIN can yield administrative authority |
| PIN rate limiting is bypassable | The limiter is in-memory and keyed on a client-supplied `X-Forwarded-For` header; it also does not hold across processes |
| No standard-login rate limiting | Password login has no attempt throttling |
| Deployment-global editable route permissions | `Role`, `AppRoute`, and `RoleRoutePermission` have no `facilityId`; a Facility Administrator in one facility changes permissions for every facility |
| Allow-by-default for unmatched routes | `resolveRouteAccess` returns `true` when no `AppRoute` prefix matches. This is a code-level policy, not a database-state artifact |
| Missing role floor on servery milestones | Servery Ready and Meal Service Started require only a facility session, with no role check |
| Shared-tablet Unit Workspace runtime failure | `/unit/[unitId]` throws at runtime on a missing `mealType` |

## Next authorized activity

**Authorization Hardening**, on branch `security/authorization-hardening-2026-08-04`, branched
from the baseline commit.

No pilot activity, deployment, feature activation, or Operations Engine work is authorized
against this baseline.
