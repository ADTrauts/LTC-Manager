# Continuous Verification — Phase 5

**Date:** 2026-08-05  
**Branch:** `engineering/continuous-verification-phase-5-2026-08-05`  
**Base:** `security/authorization-integrity-phase-4-2026-08-05` @ `7d7e38e507da4841a01df9dfdd12c444cb46084e`

**Remediation (hosted Verify repair):** [CONTINUOUS_VERIFICATION_PHASE_5_REMEDIATION_2026-08-05.md](./CONTINUOUS_VERIFICATION_PHASE_5_REMEDIATION_2026-08-05.md) on branch `engineering/continuous-verification-phase-5-remediation-2026-08-05`. Initial Phase 5 push @ `be597a9` failed hermetic tests (UTC timezone) and `verify:db` (`psql` absent on runners).

Phases 1–4 built a substantial security and runtime baseline. This phase makes that baseline
automatically enforceable through repository-owned commands and GitHub Actions.

CI verifies. It does not deploy.

## Purpose

Every proposed branch change should automatically verify dependency installation, full test
discovery, hermetic and SQL-backed suites, TypeScript, ESLint, production build, Prisma validity,
empty-database migration deploy, seed (twice), route-registry completeness (via existing tests),
secret/generated-file hygiene, and migration tracking.

## Local verification contract

| Command | Purpose | Database |
| --- | --- | --- |
| `npm test` | Discover and run every `*.test.ts` under `src/` | Optional — SQL suites skip without env |
| `npm run test:hermetic` | Same discovery; SQL-backed env vars cleared so DB suites skip | None |
| `npm run test:db` | All tests with SQL suites enabled | `VERIFY_DATABASE_URL` (required, disposable) |
| `npm run verify:static` | Discovery sentinel, migration integrity, hygiene, typecheck, lint, prisma validate | None |
| `npm run verify:build` | `next build` with `NODE_ENV` unset so caller-shell `development` cannot break production build | None |
| `npm run verify:db` | migrate deploy → seed → seed again → schema assertions → SQL-backed tests | `VERIFY_DATABASE_URL` |
| `npm run verify:all` | static → hermetic → build → db | `VERIFY_DATABASE_URL` |
| `npm run verify:discovery` | Test-file discovery sentinel | None |
| `npm run verify:migrations` | Migration directory tracking/ordering | None (git) |
| `npm run verify:hygiene` | Secret / generated-file hygiene | None |
| `npm run verify:schema-drift` | Read-only migrate diff classification | Disposable URL |
| `npm run maintenance:auth-rate-limits` | Delete expired unlocked rate-limit buckets | Disposable `MAINTENANCE_DATABASE_URL` or `VERIFY_DATABASE_URL` |

### Disposable database policy

Allowed name prefixes (parsed from the URL path, not the full string):

- `ltc_verify_`
- `ltc_test_`
- `ltc_ci_`

**Forbidden:** exact name `ltc_manager`.

Verification helpers reject missing, malformed, or non-disposable URLs and never print passwords.

Example:

```bash
# Create a disposable DB (local Postgres)
createdb ltc_verify_phase5   # or psql CREATE DATABASE

export VERIFY_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/ltc_verify_phase5?schema=public'
export AUTH_SECRET='local-verify-secret-not-for-production'
export SEED_DEMO_PASSWORD='LocalVerifySeed!ChangeMe'

npm run verify:all
```

Optional managed lifecycle (CI):

```bash
export VERIFY_MANAGE_DATABASE=1
export VERIFY_DATABASE_ADMIN_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/postgres'
# verify:db creates and drops the VERIFY_DATABASE_URL database
```

## CI architecture

**Workflow:** `.github/workflows/verify.yml`

| | |
| --- | --- |
| Triggers | Pull requests; pushes to non-`main` branches; `workflow_dispatch` |
| Node | 20 (matches `engines` and `@types/node`) |
| PostgreSQL | 16 service container |
| Concurrency | Cancel superseded runs on the same ref |
| Deploy | Never |

**Job 1 — Static and hermetic:** checkout, `npm ci`, discovery, migrations, hygiene, hermetic tests, typecheck, lint, prisma validate, production build.

**Job 2 — Database integration:** Postgres service, refuse `ltc_manager`, `verify:db` (manage+drop), recreate for maintenance dry-run and apply.

Both jobs must pass. No Phase 1–4 SQL-backed suite may skip in Job 2.

Synthetic CI secrets: `AUTH_SECRET`, `SEED_DEMO_PASSWORD` — not production values.

## Test discovery

`npm test` no longer shells out to `find`. `scripts/verify/discover-tests.mjs` walks `src/` for
`*.test.ts|tsx|mjs|js` cross-platform.

The sentinel proves:

- Independent walk matches discovery
- All four SQL-backed files are recognized even when skipped hermetically
- A temporary probe under `src/` is discovered; synthetic omission changes the set
- Paths outside `src/` are ignored
- No duplicates

## Migration integrity

Derived count (not hardcoded). Currently **63** migration directories including the digits-only
historical directory `20260423105656`.

Checks: unique names, lexicographic order, non-empty `migration.sql`, every directory tracked by
git, lock file present.

## Seed

- First and second seed must succeed (`verify:db`).
- Demo admin password is **nonproduction**. Default `ChangeMeNow123!` is allowed only when
  `NODE_ENV !== "production"` or `ALLOW_DEMO_SEED_PASSWORD=1`. Prefer `SEED_DEMO_PASSWORD` in CI
  and verify runs.
- Do not reuse the demo password outside local development.

## Schema drift

`npm run verify:schema-drift` runs `prisma migrate diff` from an applied disposable database to
`schema.prisma` (read-only).

Phase 5 classification of current differences:

| Kind | Examples | Resolution |
| --- | --- | --- |
| IDENTIFIER-NAMING DIFFERENCE | Index/constraint renames truncated by Postgres identifier limits | Accepted — new DBs have working constraints; names differ from Prisma’s preferred labels |
| EQUIVALENT DATABASE REPRESENTATION | `DROP DEFAULT` on columns where migrations set defaults Prisma no longer declares | Accepted — application behavior unchanged |
| REAL STRUCTURAL DRIFT | None found | — |

No reconciling migration was generated. Future `prisma migrate dev` may propose naming/default
noise; review before accepting.

## Lint warnings

Phase 5 target: **zero warnings**.

Disposition of the prior six:

| Warning | Classification | Resolution |
| --- | --- | --- |
| `statusValues` unused in assignments actions | Safe unused | Removed |
| `AssignmentFulfillmentSummary` unused type | Safe unused | Removed |
| `editAssignmentAction` unused import | Disabled-feature artifact | Retained with `void` + comment — Server Action must stay exported |
| `actionSections` unused | Intentional interface placeholder | Retained with `void` + comment |
| `roleKey` unused in suggestions | Incomplete wiring signal | Retained as `_roleKey` + `void` — part of public input |
| `deptId` unused on employees page | Safe unused destructure | Dropped from destructure |

## Repository hygiene

Detects tracked `.env` (except `.env.example`), `.next/`, `node_modules/`, dumps, private keys,
common token patterns, and postgres URLs with non-placeholder passwords. Documentation
placeholders `USER:PASSWORD` are allowed.

## Rate-limit maintenance

```bash
MAINTENANCE_DATABASE_URL=$VERIFY_DATABASE_URL npm run maintenance:auth-rate-limits -- --dry-run
MAINTENANCE_DATABASE_URL=$VERIFY_DATABASE_URL npm run maintenance:auth-rate-limits
```

Deletes buckets with `lastAttemptAt` older than 24h that are not actively locked. Idempotent.
**Not** an active production schedule — document only until a deployment platform exists.

SQL-backed coverage lives in `src/lib/auth-rate-limit/auth-rate-limit.test.ts` (cleanup preserves
active locks).

## How to reproduce CI locally

```bash
npm ci
npm run verify:static
npm run test:hermetic
npm run verify:build

# Disposable DB
export VERIFY_DATABASE_URL='postgresql://…/ltc_verify_local?schema=public'
export AUTH_SECRET='…'
export SEED_DEMO_PASSWORD='…'
npm run verify:db
# or
npm run verify:all
```

## Failure triage

| Symptom | Likely cause |
| --- | --- |
| Discovery sentinel fails | New test file extension not approved, or walk/discovery mismatch |
| Migration integrity fails | Untracked or empty migration directory |
| Hygiene fails | Tracked secret/generated path — remove or allowlist narrowly |
| `verify:db` rejects URL | Name is `ltc_manager` or lacks `ltc_verify_` / `ltc_test_` / `ltc_ci_` |
| SQL suites skip in CI | Job forgot to set `VERIFY_DATABASE_URL` / suite env vars |
| Build warns about NODE_ENV | Use `npm run verify:build` / `npm run build` (wrapper unsets it) |

## Explicit non-goals

- CI verifies but does **not** deploy
- Existing `ltc_manager` is **never** a verification target
- Database-backed tests **must** run in CI
- Migrations are tested from an **empty** database
- Offline continuity remains unimplemented
- Operational Assignments and Operations Engine remain disabled
- No Redis or new runtime service
- No hosted scheduler for rate-limit cleanup in this phase

## Known limitations

- Schema drift naming/default differences remain accepted without a reconciling migration
- Rate-limit cleanup has no production schedule
- GitHub Actions does not run against self-hosted runners or deploy environments
- Contributor machines still need a local Postgres for `verify:db` / `verify:all`
