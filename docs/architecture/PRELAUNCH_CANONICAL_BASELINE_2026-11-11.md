# Vssyl canonical database baseline

The active migration is `20261111120000_canonical_baseline`. The prior 189 migrations are preserved at Git commit `9e3ab45`, including their original SQL and the historical checksum exception. Install the new baseline on an empty application database with a fresh Prisma ledger.

```sh
npm ci
npm run db:generate
npx prisma migrate deploy
npx prisma migrate status
npm run db:seed:canonical
```

Set `DATABASE_URL` and `DIRECT_URL` to the verified new target before running Prisma. The seed reads its own explicit target from `VSSYL_BASELINE_DATABASE_URL` and checks `VSSYL_BASELINE_DATABASE_NAME`, the database's identity, its migration ledger, and the absence of application setup. Supply the owner password through the operator's secret environment.

| Seed input | Purpose |
| --- | --- |
| `VSSYL_BASELINE_DATABASE_URL` and `VSSYL_BASELINE_DATABASE_NAME` | Direct connection and expected database name |
| `VSSYL_BASELINE_OWNER_EMAIL`, `VSSYL_BASELINE_OWNER_NAME`, `VSSYL_BASELINE_OWNER_PASSWORD` | Verified owner identity and password |
| `VSSYL_BASELINE_FACILITY_NAME`, `VSSYL_BASELINE_TIMEZONE` | Facility name and IANA timezone |
| `VSSYL_BASELINE_FLOOR_NAME`, `VSSYL_BASELINE_NEIGHBORHOOD_NAME`, `VSSYL_BASELINE_ROOM_NAME` | Explicit names for the initial physical hierarchy |
| `VSSYL_BASELINE_ROOM_TYPE_KEY`, `VSSYL_BASELINE_ROOM_TYPE_LABEL` | Optional physical base type and Facility label. Defaults to Dining Area. |

The baseline creates the platform roles and preserves 21 SQL checks, 14 partial indexes, three application sequences, and four authorization and audit triggers. The seed creates one Organization, Facility, and owner account with Organization Administrator and Facility Administrator periods. The owner's linked Employee heads the two installed Departments, Food and Nutrition and Facility Plant Operations. The initial hierarchy has one Floor, one Neighborhood, and one room with explicit Food and Nutrition responsibility. Published system Record definitions are available for placement. The seed creates zero operational records, demo employees, payment records, published schedules, Coverage, Assignments, or Record attachments.

The test-only demo seed remains available through `prisma db seed`. The owner seed uses explicit site names supplied at execution. Capture any Terrace View names to recreate from verified setup before the production checkpoint.

The coordinated production checkpoint must identify the old and new Neon branches, databases, endpoints, Vercel environment and deployment, source SHA, retained setup, and discarded history. Apply the baseline and owner seed to the new database and verify sign-in before changing the public app's active connection.

## Verification

- Prisma Client generation and the single migration succeeded on empty PostgreSQL 14 databases. Prisma reported an up-to-date ledger.
- The production build and TypeScript checks passed. The hermetic suite passed 3,388 tests with 318 SQL-backed tests skipped. The two fresh-schema SQL runs passed 33 and 21 tests, covering Workforce, imports, Coverage, Dashboard isolation, Key Point preparation and timing, and Plant maintenance.
- The synthetic owner signed in through the account chooser, opened Facility Builder, created one room shared by two Departments, and saved independent Department notes. The owner had explicit workforce membership and Department headship.
- Browser publication initially required Rooms on Department-wide Key Points. Review and publication now use each Key Point's stored grain and publish the draft set in one transaction. Breakfast and its two room-level Key Points persisted on the selected shared Room. Run showed a saved Menu item during Lunch in that Room. A second Room of the same physical type had zero Menu matches.
- The browser saved an explicit Room Record requirement for Lunch, submitted a temperature on its next effective service date, and confirmed the stored completion and matching Review row. The isolated app clock provided the next service date. The audit loader now resolves date-effective published Cycle windows. The same authenticated session downloaded the completed CSV slot and received valid PDF and XLSX files.
- On the new baseline, the Coverage browser test published both Unit and Space requirements and verified Dashboard shortfall and its resolution. The production build passed the Team room and Dashboard-lens test, the employee Assignment complete, reopen, and replay test, and the Dashboard persona gate across Facility, Department, Supervisor, Plant, and vendor contexts.
- Asset Builder created a Plant Asset at the exact Room. The browser saved a linked corrective Work Order and published the Asset's quarterly PM Plan. All 25 Plant browser tests passed on the new baseline, including employee Request → triage → technician closeout, required Records, PM publication/versioning, and protected role boundaries.
- All 38 current offline browser tests passed across desktop Chromium and tablet. They cover exact Space, encryption, queued Assignment and Key Point submissions, interrupted response replay, changed actors, expiration, and device unbinding. The obsolete Unit browser matrix referenced removed controls and stubbed milestone persistence. Its PWA manifest check now runs with the canonical suite.
- The production build running locally against the Neon staging database reported ready, authenticated the synthetic owner, and opened the correct Facility Builder. A separate empty local database verified the proposed Terrace View seed and exact Servery room type.

## Hosted candidates and rollback

| Purpose | Verified target |
| --- | --- |
| Authoritative Neon organization | `org-hidden-leaf-35421142` |
| Live production database | `damp-hill-35484256` / `br-odd-cloud-avkhc7m6` / `neondb` at `ep-plain-salad-avjht24p-pooler.c-11.us-east-1.aws.neon.tech`. Read-only inspection verified 189 completed migrations. |
| Preserved recovery point | Manual Neon snapshot `snap-dark-waterfall-av2t59px`, named `phase2d-pre-expansion-ad87a4e-20261110T123613Z` on the live `main` branch. The live database is also available for application rollback. |
| Isolated production candidate | `damp-hill-35484256` / `br-jolly-math-avwiz3dt` / `vssyl_canonical_20261111`. Direct host `ep-icy-mode-avbj71pm.c-11.us-east-1.aws.neon.tech`, pooled host `ep-icy-mode-avbj71pm-pooler.c-11.us-east-1.aws.neon.tech`. New PostgreSQL 18 database with one applied canonical migration, six platform roles and zero users. |
| Staging database | `raspy-mode-86368121` / `br-aged-river-b8b7c2a1` / `vssyl_canonical_prelaunch_20261111` at `ep-aged-credit-b8olkuky.c-14.us-east-1.aws.neon.tech`. PostgreSQL 18 with the canonical migration and one synthetic owner. |
| Vercel staging | Project `prj_cq3byooSr1G9054JukrMx2VyZQS3`, protected Preview `dpl_Ezt7ToVdXx3Pa4iqJWePfstgGBmA` reached Ready. Its recorded source is `eea04d098e80e27253b3f7576b03c87d185d30fa`. The Preview supplies deployment-specific database and auth variables. |
| Vercel public alias | `vssyl.com` resolves to `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` in project `prj_O3x1tS8yS1rFQEmd73rofZboIDCK`. The production Marketplace resource is `store_DfnKfqpGTZx9annu` under integration `icfg_IDIfhEIETZCnO22MbkCaiXcJ`. |

Vercel's [hosted Preview build](https://ltc-manager-staging-hvwz3slqn-adtrauts-projects.vercel.app) completed. Requests to the Preview hostname from the authenticated CLI and in-app browser reset before HTTP. Automatic approval review rejected the connector's protected fetch because it creates or reuses a link that grants access to anyone holding it. Hosted sign-in and runtime verification remain pending.

The protected Preview was built from the runtime source SHA above. The later branch changes update verification, the operator seed, and documentation. The application, Prisma schema and migration, public assets, package files, and Vercel configuration match the Preview source.

## Coordinated cutover

1. Verify the final source, protected deployment, database binding, real owner identity, and selected Terrace View setup. The proposed small setup is Terrace View Long Term Care in `America/New_York`, Food and Nutrition and Plant Operations, and Floor 1 → 1A - Naval Park → Naval Park Servery. Use `kitchen` with the physical label `Servery` if that is the selected starting room. Provision the owner credential through the operator's secret environment and verify sign-in before making the new application public.
2. Switch the production build and runtime database connection to the candidate together. Configure pooled `DATABASE_URL` and direct `DIRECT_URL`, and reconcile the Marketplace-generated aliases so the production build, application runtime, and Prisma operations agree. Preserve production auth and integration settings required by the intended flows. Record the new deployment ID and its exact source before moving the public alias.
3. The old database currently has five accounts, two Facilities, six Departments, seven Employees, 23 hierarchy nodes, 21 Rooms, one Menu and two Assets. It has zero Records, Operational Assignments, Work Orders or PM Plans in the checked tables. Old data stays in its existing database for rollback. The new application starts from the explicitly approved setup and system catalogs. The proposed seed excludes the existing EVS development configuration and the second Facility.
4. If the public smoke fails, restore the prior deployment to the public alias and restore the original production connection configuration for subsequent deployments. The historical migration ledger and database remain available. Recheck the fresh deployment, public routing and owner access before retiring infrastructure.

GitHub main was verified at `56de3123ae6e5aa99a2979d8a6200469389c3cdb`, an ancestor of the canonical branch in `ADTrauts/LTC-Manager`. Synchronize by pushing the canonical branch and reviewing a normal PR after confirming Vercel's Git deployment behavior. Coordinate any main-branch production deployment with the database cutover. The clean Desktop checkout can then track the merged main or a distinct local branch at the reviewed canonical commit. The archived branches, stash and 189-migration Git history remain available.
