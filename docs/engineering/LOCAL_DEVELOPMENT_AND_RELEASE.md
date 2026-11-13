# Local development and releases

GitHub `ADTrauts/LTC-Manager` is the repository. Use `main` as the integrated source. Keep a clean checkout tracking `origin/main`, start each change on a feature branch, and update the base with `git pull --ff-only`. The original Desktop checkout and its archived branches and stash preserve pre-consolidation work for review. Use a clean checkout for current development.

Copy `.env.example` to an ignored `.env` in the clean checkout. Use an empty local PostgreSQL database such as `ltc_dev_canonical` with a local role. Set both Prisma URLs to that same local database and generate a separate local `AUTH_SECRET`. Use `ltc_verify_*`, `ltc_test_*` or `ltc_ci_*` for disposable verification databases. Keep hosted Vercel environment pulls and existing Desktop credentials out of this checkout.

```sh
npm ci
npm run db:generate
npx prisma migrate deploy
npx prisma migrate status
npm run dev
```

The active migration history starts with `20261111120000_canonical_baseline`. Apply it only to a clean canonical database. Use `npm run db:seed:canonical` with the explicit operator inputs in the [canonical baseline instructions](../architecture/PRELAUNCH_CANONICAL_BASELINE_2026-11-11.md) to create a local owner and Facility. Use the demo seed and verification fixtures for disposable tests. Keep the previous migration chain available through Git history at `9e3ab45`. Add subsequent schema changes as new migrations.

Choose local checks based on the change. For application changes, use `npm run typecheck`, `npm run test:hermetic`, and `npm run verify:build` as appropriate. Run relevant SQL and browser tests with `VERIFY_DATABASE_URL` pointing to a disposable local database. Set `VERIFY_DATABASE_ADMIN_URL` and `VERIFY_MANAGE_DATABASE=1` only for a test cluster where the runner may recreate its named test databases.

| Environment | Database and release behavior |
| --- | --- |
| Local development and CI | Loopback PostgreSQL or a disposable CI service database. GitHub Actions verifies the PR. |
| Protected staging | `ltc-manager-staging` is the dedicated staging project. The canonical staging database is `raspy-mode-86368121` / `br-aged-river-b8b7c2a1` / `vssyl_canonical_prelaunch_20261111`. Use synthetic accounts and data. |
| Vercel Git Preview | The production project has an isolated Preview scope that uses the canonical staging database. Protect generated URLs with Vercel Authentication. |
| Vercel Production | `ltc-manager` tracks GitHub `main` and uses only the canonical Production database variables. Its database is `damp-hill-35484256` / `br-jolly-math-avwiz3dt` / `vssyl_canonical_20261111`. Production schedules follow the promoted deployment. |
| Rollback | Keep the last known good canonical deployment and verify that it can use the current schema and recover existing offline data. The legacy deployment and its `neondb` database are a separate rollback pair. See the [cutover report](../architecture/PRELAUNCH_CANONICAL_CUTOVER_GATE.md). |

The original direct credential remains stored in the production project's Vercel Development scope for rollback. Use the loopback values from the local template instead of pulling that project's Development environment.

## Routine releases

1. Update a clean `main` checkout with `git pull --ff-only` and create a feature branch.
2. Develop against local or disposable PostgreSQL and run the checks relevant to the change.
3. Push the branch and open a PR into `main`. Wait for the Verify jobs **Static and hermetic**, **Database integration**, **Offline browser gate**, **Assignment browser gate**, and **Dietary pilot gate**. Review the protected Vercel Preview and verify its staging database scope. Use synthetic data for any Preview writes.
4. Review and merge with a merge commit. Vercel tracks `main` for automatic builds. Verify that a staged build exists for the merged SHA with Production settings. If the webhook produces no deployment, use the exact Git SHA for a protected, staged Production build and verify its scope before promotion review. Auto-assign Custom Production Domains is disabled, so the result is a staged deployment.
5. Check the staged build's Git SHA, Prisma generation, build result, database environment and offline recovery settings. Confirm its public aliases are empty, check protected readiness, and smoke-test the changed behavior. Verify the applied ledger and test any pending forward migration against staging before applying it to Production with approval. If the candidate needs that migration, verify it again after the migration and before promotion.
6. With separate release approval, promote the verified deployment by ID. Verify apex health, the WWW redirect, the changed public workflow, and that both scheduled jobs now belong to the promoted deployment. Retain the last compatible deployment and recovery resources.

Vercel's Ignored Build Step is set to **Automatic** with no custom command. Documentation changes can queue a build. The legacy `scripts/vercel-ignore-build.mjs` classifies executable files under documentation directories as documentation and can skip source changes in a multi-commit push when the previous Git SHA is unavailable.

Production cron runs on the promoted deployment. Plant preventive maintenance is scheduled at 06:00 UTC and Support automation at 16:00 UTC. Verify the active cron deployment and record actual invocation results separately when available.
