# Migration history exceptions

This document records **accepted historical edits** to migration SQL that was already applied
to shared databases before the edit landed in git. These are not forward migrations and must not
be “fixed” by rewriting history in `_prisma_migrations` on production or developer `ltc_manager`
databases.

Empty-database verification (`npm run verify:db`, CI Job 2) always replays the **current on-disk**
`migration.sql`. Legacy checksum comparison uses the manifest below for classification only.

## Governance

| Mechanism | Purpose |
| --- | --- |
| `scripts/verify/migration-checksum-exceptions.json` | Machine-readable repo integrity manifest (sha256 of current file) |
| `scripts/verify/lib/migration-checksum.mjs` | Repo manifest verification + legacy checksum classification |
| `npm run verify:migrations` | Fails if an excepted file changes without manifest update; fails if docs are missing |
| `src/lib/verify/migration-checksum.test.ts` | Unit tests for manifest and legacy acceptance rules |

**Rules**

1. Further edits to an excepted `migration.sql` require updating `repoSha256` in the manifest **and**
   this document in the same change.
2. Undocumented checksum drift always fails verification.
3. CI never connects to `ltc_manager` for checksum reconciliation.

---

## Exception: `20260423105656`

| Field | Value |
| --- | --- |
| **Classification** | ACCEPTED HISTORICAL APPLIED-MIGRATION EDIT |
| **First committed** | `a186745` (2026-05-14) — repository first commit |
| **Repo sha256 (current file)** | `c94c71258d91d8d4eb14c3d3aca09886fdb54ff8b46b0ffc88c9cf43fa039555` |
| **Why edited after apply** | Auto-generated follow-up migration was modified locally to add `IF EXISTS` guards so Prisma shadow-database replay would not fail when the table-creation migration had not yet run. The change preserves empty-database deploy behavior while allowing `migrate dev` replay on partial histories. |
| **SQL (summary)** | `ALTER TABLE IF EXISTS "ServeryMealServiceEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;` |
| **Empty-DB replay** | Safe — guarded DDL is a no-op until the table exists; full `migrate deploy` on disposable DBs succeeds in CI and locally. |
| **Resolution** | Do **not** rewrite `_prisma_migrations` on `ltc_manager`. Accept documented legacy checksum via manifest for comparison tooling; keep repo file stable unless a new forward migration is required. |

### Git history (abbreviated)

```
a186745 first commit — file added with IF EXISTS guard and explanatory comments
```

No later commits modify this file. The exception exists because applied databases may retain an
older Prisma migration checksum in `_prisma_migrations` while the repo file intentionally differs.
