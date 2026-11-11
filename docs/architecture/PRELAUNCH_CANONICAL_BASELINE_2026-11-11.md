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
| `VSSYL_BASELINE_FLOOR_NAME`, `VSSYL_BASELINE_NEIGHBORHOOD_NAME`, `VSSYL_BASELINE_DINING_ROOM_NAME` | Explicit names for the initial physical hierarchy |

The baseline creates the platform roles and preserves 21 SQL checks, 14 partial indexes, three application sequences, and four authorization and audit triggers. The seed creates one Organization, Facility, and owner account with Organization Administrator and Facility Administrator periods. The owner's linked Employee heads the two installed Departments, Food and Nutrition and Facility Plant Operations. The initial hierarchy has one Floor, one Neighborhood, and one Dining Area room with explicit Food and Nutrition responsibility. Published system Record definitions are available for placement. The seed creates zero operational records, demo employees, payment records, published schedules, Coverage, Assignments, or Record attachments.

The test-only demo seed remains available through `prisma db seed`. The owner seed uses explicit site names supplied at execution. Capture any Terrace View names to recreate from verified setup before the production checkpoint.

The coordinated production checkpoint must identify the old and new Neon branches, databases, endpoints, Vercel environment and deployment, source SHA, retained setup, and discarded history. Apply the baseline and owner seed to the new database and verify sign-in before changing the public app's active connection.

## Local verification

- Prisma Client generation and the single migration succeeded on empty PostgreSQL 14 databases. Prisma reported an up-to-date ledger.
- The production build passed. The hermetic suite passed 3,385 tests with 318 SQL-backed tests skipped. The two fresh-schema SQL runs passed 33 and 21 tests, covering Workforce, imports, Coverage, Dashboard isolation, Key Point preparation and timing, and Plant maintenance.
- The synthetic owner signed in through the account chooser, opened Facility Builder, created one room shared by two Departments, and saved independent Department notes. The owner had explicit workforce membership and Department headship.
- The browser test found that publication required Rooms on Department-wide Key Points. Review and publication now use each Key Point's stored grain. A draft set publishes in one transaction. The focused review and publication tests passed.
- The compliance renderers preserve scalar and repeating responses. The PDF export route traces PDFKit's standard font modules. The five focused report tests passed.
