# PF-2D-002 — Coverage editor is absent from the active Department Builder

**Status: OPEN — release blocker.** Found November 10, 2026 during authorized pre-promotion smokes. No application fix was made; Phase 2D was not promoted.

Candidate: `ad87a4e308ee3fd3a445c6677b728aa0c728a3b5`.

Staged production-configured deployment: `dpl_GsxhA1AheWVNNhd5A36Cxf5Jk8ZJ`, READY, `https://ltc-manager-qd6z107hd-adtrauts-projects.vercel.app`.

## Reproduction

1. Sign in as the existing authorized Dietary manager test identity.
2. Open `/build/departments/cmsmlfkrw000axwjamkkdbiza?tab=people`.
3. Observe the People & Coverage section: it renders the Team list and Team configuration only. No Coverage template list or editor is mounted.
4. Open the previous Coverage entry, `/build/departments/cmsmlfkrw000axwjamkkdbiza?tab=coverage`.
5. Observe HTTP 307 to the People & Coverage URL above. The missing Coverage editor is not recovered through that entry.

No Coverage requirement, staffing shortfall, Assignment, or other operational record was created for this reproduction.

## Source and contract evidence

- `src/app/(protected)/admin/departments/[departmentId]/page.tsx:330` renders only `TeamsPanel` for `tab === "people"`.
- `src/lib/department-administration/admin-nav.ts:56` maps retired `coverage` links to `people`.
- `coverage-panel.tsx` imports and renders `CoverageWorkspace`; no active page imports `CoveragePanel`. The edited Space/Unit targeting UI in `coverage-workspace.tsx` is consequently unreachable from the active Builder.
- `docs/product/01B_PHASE_1_ARCHITECTURE_CONTRACTS_AMENDMENT_2026-11-08.md:113` places Coverage templates in Department Builder → People & Coverage. Teams do not own Coverage need.
- `docs/architecture/PHASE_2D5_COVERAGE_TEAMS_LEGACY_READER_RECONCILIATION.md:44` reports the Unit versus Space picker; that component exists, but its mounting is missing.

All 2,555 uploaded source-file hashes match the certified candidate, so this is not an upload/source-identity mismatch. The same page omission exists at the protected Phase 2C commit. It predates the three-line PF-2D-001 repair, but it is a newly discovered functional gap outside the product owner's accepted limitations.

## Consequence and release decision

The runtime can compose persisted Space Coverage after PF-2D-001, but an authorized user cannot configure or inspect Coverage templates through the supported active Builder. The mandatory explicit Space Coverage targeting surface cannot pass its release gate. There are no existing production Coverage items, so live runtime reads cannot establish that authoring is available.

Promotion is withheld. Public service remains on `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` (Phase 2C). Both authorized additive migrations have already completed and are retained: production has 189 finished migrations. The pre-expansion Neon snapshot remains available without expiry. No rollback or destructive restore was executed.

## Bounded remediation proposal — not executed

Compose the existing Coverage owner into the accepted People & Coverage section alongside Team configuration, preserving Department authority and the existing Space/Unit targeting rules. Keep retired tab URLs as redirects; do not reopen a retired top-level authoring surface or introduce another store/engine. Verify that an authorized manager can reach the Coverage editor and its explicit Space catalog in an isolated database, that restricted viewers remain denied/read-only as appropriate, and that existing Team navigation remains intact. Then certify the resulting application SHA and obtain release authorization for that changed candidate before promotion. No production dummy data is needed.
