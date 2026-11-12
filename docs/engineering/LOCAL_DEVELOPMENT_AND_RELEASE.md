# Local development and releases

GitHub `ADTrauts/LTC-Manager` is the repository. Use `main` as the integrated source once the canonical synchronization PR lands. Keep a clean checkout tracking `origin/main`, start each change on a feature branch, and update the base with `git pull --ff-only`. The original Desktop checkout and its archived branches and stash preserve pre-consolidation work for review. Use a clean checkout for current development.

Copy `.env.example` to an ignored `.env` in the clean checkout. Use an empty local PostgreSQL database such as `ltc_dev_canonical` with a local role. Set both Prisma URLs to that same local database and generate a separate local `AUTH_SECRET`. Use `ltc_verify_*`, `ltc_test_*` or `ltc_ci_*` for disposable verification databases. Keep hosted Vercel environment pulls and existing Desktop credentials out of this checkout.

```sh
npm ci
npm run db:generate
npx prisma migrate deploy
npx prisma migrate status
npm run dev
```

The active migration history starts with `20261111120000_canonical_baseline`. Apply it only to a clean canonical database. Use `npm run db:seed:canonical` with the explicit operator inputs in the [canonical baseline instructions](../architecture/PRELAUNCH_CANONICAL_BASELINE_2026-11-11.md) to create a local owner and Facility. Use the demo seed and verification fixtures for disposable tests. Keep the previous migration chain available through Git history at `9e3ab45`. Add subsequent schema changes as new migrations.

Run `npm run typecheck`, `npm run test:hermetic` and `npm run verify:build` before review. Run relevant SQL and browser tests with `VERIFY_DATABASE_URL` pointing to a disposable local database. Set `VERIFY_DATABASE_ADMIN_URL` and `VERIFY_MANAGE_DATABASE=1` only for a test cluster where the runner may recreate its named test databases.

| Environment | Database and release behavior |
| --- | --- |
| Local development and CI | Loopback PostgreSQL or a disposable CI service database. GitHub Actions verifies the PR. |
| Protected staging | `ltc-manager-staging` is the dedicated staging project. The canonical staging database is `raspy-mode-86368121` / `br-aged-river-b8b7c2a1` / `vssyl_canonical_prelaunch_20261111`. Use synthetic accounts and data. |
| Vercel Git Preview | The production project has an isolated Preview scope that uses the canonical staging database. Protect generated URLs with Vercel Authentication. |
| Vercel Production | `ltc-manager` tracks GitHub `main` and uses only the canonical Production database variables. Its database is `damp-hill-35484256` / `br-jolly-math-avwiz3dt` / `vssyl_canonical_20261111`. Production schedules follow the promoted deployment. |
| Rollback | Keep the former immutable deployment and its `neondb` database together. The recovery snapshot and exact rollback steps are recorded in the [cutover report](../architecture/PRELAUNCH_CANONICAL_CUTOVER_GATE.md). |

During alignment, Vercel's ignored build step is `exit 0` and automatic production domain assignment is disabled. GitHub still runs its PR checks. A manual hosted production verification uses an exact Git archive, the Production-scoped settings, and `vercel deploy --prod --skip-domain`. Verify that the resulting deployment is protected and has no public aliases, then check readiness and confirm that public traffic and cron still belong to the current deployment.

After the canonical PR is reviewed and integrated, confirm that the tracked Production branch contains the reviewed application, the database scopes are correct, and a staged build succeeds. Restore the normal Git build step only through the release decision. Keep automatic domain assignment disabled for reviewed promotions. Promote a verified staged production deployment as a separate release step.
