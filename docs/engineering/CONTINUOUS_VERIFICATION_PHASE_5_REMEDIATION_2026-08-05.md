# Continuous Verification — Phase 5 remediation

**Date:** 2026-08-05  
**Branch:** `engineering/continuous-verification-phase-5-remediation-2026-08-05`  
**Base:** Phase 5 @ `be597a93e0de1ba4c12d776907b169d9d0f5b8c0`

This remediation repairs hosted Verify failures on the Phase 5 branch and adds governed handling
for the historical migration checksum exception `20260423105656`.

Parent doc: [CONTINUOUS_VERIFICATION_PHASE_5_2026-08-05.md](./CONTINUOUS_VERIFICATION_PHASE_5_2026-08-05.md)

## Hosted failure (run 31012166369)

| Job | Failed step | Duration | Upstream steps |
| --- | --- | --- | --- |
| Static and hermetic | Hermetic tests | ~28s | discovery, migrations, hygiene PASS |
| Database integration | verify:db | ~36s | install, ltc_manager safety refuse PASS |

Logs required GitHub authentication; step conclusions were confirmed via the public Actions API.

## Root causes (reproduced locally)

### 1. Hermetic tests — host timezone (UTC on GitHub Actions)

Several suites construct `new Date("YYYY-MM-DDTHH:mm:ss")` without a zone offset. Node interprets
those as **local** instants. On `ubuntu-latest` (default `TZ=UTC`), meal-phase heuristics resolve
to `BREAKFAST` instead of the intended `LUNCH` for America/New_York facility logic.

**Reproduction**

```bash
# Host TZ=UTC with TZ explicitly set (pre-fix behavior on GHA):
TZ=UTC npm run test:hermetic   # 8 failures (operations + unit-workspace servery cases)
# After fix: leave TZ unset (runner pins America/New_York) or set it explicitly:
env -u TZ npm run test:hermetic
TZ=America/New_York npm run test:hermetic
```

**Fix**

- `scripts/verify/run-tests.mjs` always pins `TZ=America/New_York` (overrides caller `TZ=UTC`).
- `.github/workflows/verify.yml` sets workflow `TZ: America/New_York`.

### 2. Database integration — `psql` dependency

`verify:db` with `VERIFY_MANAGE_DATABASE=1` and the maintenance recreate step both invoked `psql`.
GitHub-hosted `ubuntu-latest` runners do not ship `postgresql-client`, so admin create/drop could
fail even with a healthy Postgres service.

**Fix**

- `scripts/verify/admin-database.mjs` — `prisma db execute --stdin` against the admin URL for
  `CREATE/DROP DATABASE` (avoids Prisma Client transaction wrapping and removes the `psql` dependency).
- `verify-db.mjs` uses the helper instead of `psql`.
- Workflow maintenance recreate step uses the same helper via `node --input-type=module` (no `psql`).

## Migration checksum governance

See [MIGRATION_HISTORY_EXCEPTIONS.md](./MIGRATION_HISTORY_EXCEPTIONS.md).

| Artifact | Role |
| --- | --- |
| `scripts/verify/migration-checksum-exceptions.json` | Expected sha256 of current repo file |
| `scripts/verify/lib/migration-checksum.mjs` | Repo integrity + legacy classification |
| `src/lib/verify/migration-checksum.test.ts` | Unit tests |

`npm run verify:migrations` now verifies the manifest and required docs. Further edits to
`20260423105656/migration.sql` fail until the manifest (and doc) are updated.

## Local verification matrix (post-fix)

Run from repo root on remediation tip:

| Command | Expected |
| --- | --- |
| `npm run verify:static` | PASS |
| `TZ=UTC npm run test:hermetic` | PASS (TZ pinned by runner) |
| `npm run verify:build` | PASS |
| `VERIFY_DATABASE_URL=…/ltc_verify_* npm run verify:db` | PASS (Prisma admin DDL) |
| `npm run verify:migrations` | PASS + `documented checksum exceptions: 1` |

## Commits

1. `fix(ci): repair hosted verification workflow` — TZ pinning, Prisma admin DB lifecycle
2. `test(db): govern documented migration checksum exception` — manifest, integrity wiring, tests
3. `docs(engineering): record Phase 5 remediation` — this file + migration exception doc

## Hosted rerun results

| Run | Commit | Conclusion | Duration | URL |
| --- | --- | --- | --- | --- |
| 31025801223 | `9ffc3a7` (docs commit) | **success** (both jobs) | ~2m 25s | https://github.com/ADTrauts/LTC-Manager/actions/runs/31025801223 |
| 31026011454 | `c83d7cc` (tip: always pin TZ) | **success** (both jobs) | ~2m 21s | https://github.com/ADTrauts/LTC-Manager/actions/runs/31026011454 |

Failed original Phase 5 tip run: [31012166369](https://github.com/ADTrauts/LTC-Manager/actions/runs/31012166369) @ `be597a9`.

## Certification

**PASS WITH DOCUMENTED HISTORICAL EXCEPTION**

- Hosted Verify is green on remediation tip `c83d7cc`.
- Both jobs succeed (static/hermetic and database integration).
- The only governed checksum exception remains `20260423105656`.
- Empty-database migrate/seed/SQL suites remain green in CI Job 2.
