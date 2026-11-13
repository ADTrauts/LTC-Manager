# Vssyl pre-launch consolidation — first execution report

> **HISTORICAL checkpoint.** For current implementation use the [canonical reference](../README.md). The following material records its original checkpoint.

**Checkpoint:** infrastructure retirement, source reconciliation, PF-2D-002 and explicit Team room workflow. This is a local implementation checkpoint. Final legacy removal, clean baseline and public cutover are still required.

**Authoritative branch:** `architecture/prelaunch-canonical-consolidation` in `work/vssyl-canonical` under the Codex task workspace. Application commit: `7a06172e790148c36a05dc20cc2fbe8c78e5febe`.

Later progress: [Workforce and retained CLI checkpoint](PRELAUNCH_WORKFORCE_PROGRESS_2026-11-10.md). The original test receipts below remain the first checkpoint, including its subsequently reconciled eight failures.

## Verified infrastructure

| Purpose | Identity and evidence | Result |
|---|---|---|
| Retained Neon login | `trautman.andrew.d@gmail.com`; signed-in console showed `Vercel: adtrauts' projects` | Retained |
| Retained organization | `org-hidden-leaf-35421142` | Retained; never deleted/reset |
| Production project/database | `damp-hill-35484256`, `ltc-manager-db`, `main` / `br-odd-cloud-avkhc7m6`, `neondb`; recorded pooler `ep-plain-salad-avjht24p-pooler.c-11.us-east-1.aws.neon.tech` | Retained |
| Nonproduction project | `raspy-mode-86368121`, `ltc-manager-staging-db`, same retained organization | Retained |
| Marketplace link | Vercel `ltc-manager` / `prj_O3x1tS8yS1rFQEmd73rofZboIDCK`, integration `icfg_IDIfhEIETZCnO22MbkCaiXcJ`, resource `store_DfnKfqpGTZx9annu` | Retained |
| Certification login | CLI OAuth user `6ac0626e-3378-4afc-b4a3-0d2b2e4837fc`, `andrew.trautman@vssyl.com` | Independent identity; not deleted |
| Certification organization | `org-quiet-cake-64686025`, Andrew, free plan; sole project was `vssyl-cert` | Now empty; organization/account retirement remains |
| Certification Neon project | `delicate-unit-53515438`, main `br-hidden-sound-bcntfjvs`, only database `vssyl_cert`, owner `vssyl_cert_owner` | **Deleted; subsequent explicit organization project list is `[]`** |
| Certification hosting dependency | Vercel `vssyl-cert`, `prj_JeESAC2g6z7NQSAVV6J09469yVJm`; two certification `.vercel.app` domains, no linked Git repository, disabled cron definitions | **Deleted; subsequent team project inventory excludes it** |
| Other Vercel projects | `ltc-manager-staging` and unrelated `nextjs` | Untouched |

These were two authenticated login identities, not merely two organizations in the same browser login. The CLI certification profile could not access the retained production organization. No production data was copied into the obsolete account.

The remaining empty certification organization cannot be deleted through the installed Neon CLI: `orgs` exposes only `list`. Available browser sessions are signed into the retained Gmail account. Retiring that organization or login requires its authenticated account-management UI and verification of any account-level impact; deletion of the shared/retained identity is not authorized.

Production/Preview/Development non-decrypted Vercel metadata shows globally targeted database keys with no branch-specific override. Production connection identity matches the existing private local production configuration and signed-in Marketplace/Neon console. Actual Preview/Development runtime hosts were not independently queried. Bulk decrypted environment retrieval was rejected by automatic approval review because it would retrieve production secrets unnecessarily; no alternative secret-extraction path was used. A narrow, reviewed connection change belongs to the coordinated cutover.

Local `.neon` and `.env.vssyl-cert` are removed from active Desktop configuration and preserved privately with verified copies. The old hardcoded N5DH provisioning script is archived as text outside executable source; no package/CI entry point invokes it. Certification infrastructure is no longer an active canonical application dependency. Old Git history and archived evidence still name it deliberately.

## Repository reconciliation

- Correct remote: `https://github.com/ADTrauts/LTC-Manager.git`. No code from the retired Vssyl repository was used.
- Canonical integration starts from certified documentation-inclusive `ad87a4e308ee3fd3a445c6677b728aa0c728a3b5` and merges actual GitHub main `56de312`. The latter contains People & Coverage composition and other current fixes missing from the release branch.
- Resolved 48 conflicted paths while preserving PF-2D-001, explicit Unit/Space Coverage, descriptive Department notes, current authorization and current Team functionality. Conflicted originals and decisions are archived locally.
- Original Desktop checkout remains on `architecture/phase-2d6-release-candidate`, SHA `e1fc6d2b56e47d84df0a2a16993cf3a518eacb21`. It is clean. Its useful reports are imported; uncertain R4 harness files are preserved outside active test discovery. Named stash `prelaunch-20261110-preserved-desktop-work` is `a0ff7176a62d0e49d023815e7628dbaed10216ea`; a private patch/untracked archive also exists.
- Restored the missing canonical migration from committed bytes. Duplicate directory ending ` 2` is archived. Restored SQL SHA-256 is `b6fe0559b8ee0807c9ada8703123a8e68ca247422834ef80118c5e783edd8c5a`.
- Preserved old Desktop HEAD/local main and unmerged Phase 8.3 work with archive refs. `bfe4543`, `754f383`, and `cf28c0c` contain Records/PDF/issue-code work not automatically merged. They remain an explicit assessment item; they were not discarded or certified as redundant.
- An unapplied parallel migration, `20261108120000_people_coverage_explicit_space_and_org_teams`, would duplicate the later `spaceId` expansion and drop Team room membership. Its exact bytes are archived outside `prisma/migrations`. No applied SQL/checksum or production migration receipt was rewritten.

There was no push, force push, deployment, promotion, alias change, production schema change, or active connection replacement in this checkpoint.

## Implemented user workflows

**Coverage:** Department Builder → People & Coverage now mounts the existing Today summary, Coverage editor and organization/Teams panel. The existing authorization/service lifecycle remains authoritative. The actual UI creates a draft, adds explicit Unit and Space requirements, selects the registry role, count and Cycle, publishes, reloads stored requirements, and forks a draft when a published row is edited. The shared action wrapper now follows returned expectation IDs. Reloading an open drawer no longer causes a hydration error.

Publication is next facility service day under the current lifecycle. The permanent regression verifies persistence and the new requirement through actual RLS/Dashboard loaders at its effective time, and verifies today's actual Dashboard with its currently effective fixture requirement. It does not backdate production publication or pretend a future requirement affects today. Tested need: 2 required / 1 assigned / at risk; unconfigured and other-Department/Facility controls remain.

**Teams:** Employee Builder authors explicit normal-room membership through the Team service and existing room picker. Save/reload persists the canonical membership rows. An optional Supervisor Team Dashboard lens consumes explicit rooms intersected with active Facility/Department responsibility. Team membership grants no permission, operational eligibility, Coverage need or today's Assignment. Responsibility removal prunes membership. Maintenance readers receive the same explicit room filter so unrelated Department maintenance does not appear as a Team item.

**Authorization:** Browser coverage includes Department Manager/head writes, Facility Administrator read-only behavior for a self-operated Department they do not head, a valid Supervisor Team lens, and rejection of a forged other-Department Team lens. SQL regression covers shared-room Department layers, foreign Facility exclusion, unauthorized fact calls, Team-room exclusion and responsibility removal.

## Actual canonical inventory and remaining retirement

| Area | Current implementation | Remaining work |
|---|---|---|
| Physical hierarchy | Facility Builder, `UnitSpace.id`, `UnitSpaceResponsibility`; Department notes remain descriptive | Full room → two Departments workflow on final schema |
| Records | Catalog/install/attachment/evidence owner exists; Log Book/Review projections | Records evidence/Review vertical and remaining legacy adapters |
| Rhythm | Published Cycles, explicit rooms and Key Point groups | Remove residual OT options/fields, verify publish/applicability/Key Points |
| Workforce | Registry roles, explicit Department qualifications, Assignment, Schedule and Team membership exist | Remove duplicate Department Job Role capability/tier/default-role paths |
| Coverage | Reachable explicit Unit/Space editor; PF-2D-001/002 regressions | Re-run after final baseline and complete Assignment placement UI vertical |
| Teams | Normal rooms persist; authorized Team lens and maintenance filtering | Repeat in final schema/complete authorization matrix |
| Menus | Explicit location/Cycle ownership exists | Remove residual classification option reader; meal-timing vertical |
| Assets/Plant/PM | Existing canonical domain lifecycles retained | Asset placement → Work Order/PM vertical, including Team filters |
| Employee/offline | Existing assignment placement, bundle, queue, receipts and idempotency exist | Rehome ONE_OFF into explicit Assignments before Work removal |

Reference scan of active code found profile/archetype persistence access in 4 runtime files, duplicate Job Role access in 7, generic Work access in 12, and overlay access in 1, plus tests/scripts. This scan is a dependency aid, not a claim that every transitive consumer is gone. The [machine-readable reference inventory](prelaunch-retirement-reference-inventory.json) names each path. [Checkpoint evidence](prelaunch-consolidation-evidence.json) records the source, provider retirement and test receipts.

## Dependency-ordered retirement and baseline

1. **Accepted ONE_OFF rehome:** retain useful instructions/completion/reopen/offline behavior under existing Workforce Assignments. Require an employee, actual registry role and location. Reuse Assignment `notes`, status, event history and existing offline receipts where sufficient; do not introduce another generic task engine. Exercise supervisor creation, employee completion, reopen and replay/conflict/idempotency before removing the old owner.
2. **ARR-008:** remove Department Job Role models/services/editor/import/workbook selectors and Assignment-derived labels/defaults. HR Job Title stays HR, `RoleKey` stays authority, qualifications remain explicit. Verify employee/import/assignment UI and ineligible/foreign controls.
3. **ARR-004:** remove remaining Cycle/Menu operational-type selectors, closed profile authoring exports, historical classification readers, Experience/archetype bindings, type Log default overlays and authority mappings. Replace legitimate facts only in their canonical domain; never relabel OT as physical Room Type.
4. **ARR-003:** remove old Work Plan/Item/Applicability/Occurrence/Event services, adapters, APIs/UI, presets/catalog rows and old offline payloads after the Assignment rehome. Retire tests that enforce the intentionally removed architecture; keep real regressions.
5. Review the resulting Prisma relationships, tenant/authority constraints, indexes and required SQL constraints. Archive the 189-migration chain outside the active installation path. Generate one initial baseline for an **empty** database; preserve old applied receipts as evidence, never use `migrate resolve` to disguise drift.
6. Verify the baseline from empty PostgreSQL and then a fresh database/branch inside retained `damp-hill-35484256`. The current local integration used PostgreSQL **14.18**, not Neon PostgreSQL 18. Matching-provider verification remains required before cutover.
7. Produce a small reproducible canonical seed: sole product-owner identity/authentication, Facility, relevant Departments, minimal Floor/Neighborhood/Spaces, required permissions/catalogs. Preserve the owner credential privately through the existing identity mechanism; no credential material in Git/reports. Do not replay demo operational state, old OTs/Work Plans or historical evidence. The large demo seed used for isolated testing is not the proposed production seed.
8. Run the populated UI → persistence/reload → server/runtime → authorization workflows for Facility/two Departments, Records/Review, Rhythm/Key Points, Coverage/Assignments, Teams, Menus/meal timing, Assets/Work Orders/PM and employee/offline. Then stage one coherent application and coordinate one application/database cutover.

The owner selected explicit role/location Assignments for ONE_OFF during this execution. That decision is recorded in 01C and ARR. Rehoming is the next implementation milestone; it is not claimed complete here. ARR-003, ARR-004 and ARR-008 remain open for real remaining implementation, with old compatibility restrictions removed.

## Validation receipts

| Check | Actual result |
|---|---|
| Prisma Client generation | PASS on the integrated schema |
| Local empty-database migration replay | PASS — 189 historical migrations; transitional, not the final baseline |
| Typecheck | PASS in the clean production build; standalone checkpoint run also recorded |
| Production build | PASS; repeated after the Team maintenance scope repair |
| Focused Coverage/Team/viewer hermetics | 62 passed, 0 failed |
| Focused maintenance/fact-pack hermetics | 58 passed, 0 failed (overlaps the viewer checks above) |
| Persisted PF-2D-001 + Team integration | 10 passed, 0 failed; original 9 Coverage checks retained |
| Actual production-runtime Playwright | 2 passed, 0 failed, 21.7 seconds; Coverage lifecycle/FA read-only + Team save/lens/foreign lens exclusion |
| Team maintenance regression control | Failed on the previous build with the actual outside-room Work Order; passed after the repair |
| Full hermetic baseline | 4,001 total: 3,679 pass, 314 skip, 8 fail — not a full certification pass |

The 8 broader failures are in existing Records applicability/overlay expectations (3), the Location Function retirement-message source assertion (1), Work redirect absence (1), the old Plant Getting Started Work entry (1), and old Plant starter Work fences (2). They must be reconciled with the accepted architecture during retirement. Do not reintroduce overlays/Work UI or retain obsolete API stubs merely to make those tests pass. Direct Unit/Department/Facility Records targeting and room-level applicability need deliberate assertions, not silent deletion of test coverage.

A Next response-stream cancellation appeared during browser navigation; no browser page error occurred in the Coverage regression. A duplicate-key warning in existing Dashboard fixture content was observed during development. That is an additional rendering cleanup item, not evidence of authorization or persistence failure.

Permanent browser entry point: `npm run test:coverage-builder-browser`, using an explicit guarded `VERIFY_DATABASE_URL` for a disposable local database. It extends the existing Dashboard Playwright runner/configuration and existing fixture/account helpers. No new testing framework was introduced.

Raw traces, private environment files and synthetic login credentials stay local. User-facing evidence contains screenshots and redacted summaries only.

## GitHub and normal-checkout plan

Keep the canonical branch authoritative while retirement continues. Assess/archive the three unique Phase 8.3 commits before declaring source reconciliation final. At the coordinated release checkpoint, review the complete diff from actual remote main, verify no production configuration/secrets are staged, and synchronize via an ordinary branch push/PR. Do not force-push or replace remote history. Account for Vercel's Git deployment behavior before any push; a future push is not part of this checkpoint.

After the final canonical commit is ready, detach/release the temporary worktree's branch, switch the clean Desktop checkout to that branch, install/generate from its lockfile, and initialize its local canonical database from the final baseline/seed. Its old private production configuration must not become the default development target. The named stash and archive preserve reviewable prior work without making it an active dependency.

## Coordinated cutover record still required

Public production remains the previously recorded Phase 2C deployment `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS`, source `7973254ee87da2d94291f4282337441944d042fa`. Staged Phase 2D was not promoted. The two Phase 2D migrations are already applied to the retained old database; do not reapply them there.

Before replacing its connection or destructively resetting it, present the exact old/new database/branch identities, discarded operational/demo data, deliberately recreated setup/owner identity, environment/integration changes, verified owner login, source SHA, staged deployment, maintenance window and recovery steps. Use the existing retained-project snapshot/recovery record. This is the one coordinated destructive/connection checkpoint, not a new approval cycle for every retired component.
