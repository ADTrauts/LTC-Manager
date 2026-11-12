# Phase 2D release remediation — PF-2D-001

Date: November 10, 2026 (America/New_York). Product: Vssyl. Repository: `ADTrauts/LTC-Manager`.

**Remediation: PF-2D-001 RESOLVED.**
**Certification: PASS WITH GAPS.**
**Deployment recommendation: READY FOR PRODUCT-OWNER DEPLOYMENT APPROVAL.**

All required remediation checks pass. The gaps are retained limits: simulated tablet rather than a physical device, two rendered Dashboard personas with the remaining personas covered through authenticated HTTP/server integration, and the existing deferred quantitative readiness contract. They are not unresolved Coverage or authorization defects. No migration, push, production configuration change, deployment or promotion was performed.

## Source identity and isolation

- Blocked starting candidate: `e1fc6d2b56e47d84df0a2a16993cf3a518eacb21`.
- Prior application certification tip: `9bc5f8320f8491a0c66dab894391bdf3f199d4cb`.
- New verified application commit: `319e5700fa6eda306aabe6bb186295055cec3595`.
- Final documentation-inclusive release candidate: `ad87a4e308ee3fd3a445c6677b728aa0c728a3b5`. This is the documentation-only successor of the verified application commit; their non-documentation trees match.
- Isolated branch: `architecture/pf-2d-001-remediation`, in this chat's `work/phase2d-remediation` clone. No divergent main branch was merged or rebased.

The original Desktop checkout remained on its original branch and SHA. Its deleted canonical migration, byte-identical untracked duplicate migration directory, R4 evidence/harness, `.neon`, other uncommitted work, and existing branch refs were preserved. The new branch contains the committed canonical migration paths, not the duplicate directory or local credentials. The candidate is also preserved on a newly named local branch in the active repository; no GitHub branch was pushed or changed.

The final documentation tip adds only certification documents to the application commit. The exported manifest records both immutable SHAs and their matching non-documentation tree digest. This avoids treating a later documentation commit as an unverified executable change. A clean detached checkout was used to verify the committed candidate's source identity and rerun the permanent SQL regression.

## Defect confirmed before editing

The blocked candidate was reproduced on a new disposable localhost database, `ltc_verify_pf2d001_fresh`, migrated from empty through all **189** expected migrations. The existing preflight fixture was reused: a shared Space, Dietary Coverage need of 2, one matching assignee, a published active Cycle and a confirmed Assignment plan. No production fixture or real resident/employee information was used.

Before the application edit, the original integration harness returned **12 pass / 2 fail / 0 skip**. Its failures were exactly the lost prefetch `spaceId` and the missing RLS Coverage slot. The new permanent test was also run before the fix: **3 pass / 6 fail / 0 skip** (eight subtests plus their parent). Its failing groups covered prefetch, RLS, Dashboard, full staffing, and the separate shared-room layer; the parent reflected those failures. Unit-only and unconfigured-room controls already passed. These red runs are historical before-fix evidence, not part of the final green ledger.

## Root cause and exact fix

Only three production lines changed, all in `src/lib/runtime-location-state/prefetch.ts`:

1. The intermediate Coverage item shape now includes nullable `spaceId: string | null`.
2. `toCoverageTemplates` preserves `spaceId: item.spaceId`.
3. The Prisma template-item select requests `spaceId: true`.

The existing canonical Coverage type, matcher, RLS composer, Assignment actuals, Dashboard calculations, permission rules and historical OT matching were not changed. No model, dependency, engine, migration, new authoring path, or Room Type fallback was added.

Files in the application commit:

- `src/lib/runtime-location-state/prefetch.ts` — three-field propagation fix.
- `src/lib/runtime-location-state/coverage-space-prefetch.db.test.ts` — permanent database-backed integration regression and controls.
- `scripts/verify/discover-tests.mjs` — registers that SQL suite with the existing verification infrastructure.

## Before/after operational evidence

| Boundary | Blocked candidate | Repaired candidate |
|---|---|---|
| Persisted template item | Correct Space id; required=2 | Same persisted configuration |
| Actual Prisma prefetch | `spaceId` absent | Exact persisted Space id retained |
| RLS operation / plan | ACTIVE / RUNTIME_VISIBLE | ACTIVE / RUNTIME_VISIBLE |
| RLS Coverage slots | Empty | One slot: required=2, filled=1, `AT_RISK` |
| Dashboard Coverage | Quiet “Coverage is in place.” | Coverage gaps=1; “1 role at risk”; no false quiet-success message |
| Fully staffed control | Configured slot was lost | Required=2, filled=2, `COVERED`; no false shortfall |
| Unconfigured sibling | No slots | Still no slots or invented staffing requirement |
| Unit-wide control | Unit expansion supported | Still one configured slot per explicitly covered room |

The actual production-built Dashboard was rendered in Chromium and its Coverage metric was asserted to equal 1. The two original failing preflight assertions now pass. The prior in-memory diagnostic is retained as a diagnostic control only; it is not the basis of remediation certification.

## Permanent regression and controls

`coverage-space-prefetch.db.test.ts` follows the repository's `node:test` SQL opt-in pattern. It requires a disposable URL and ensures the global Prisma client targets the same database. Its assertions exercise:

1. Database persistence → actual Prisma prefetch, including the exact Space id, null Unit target and empty OT keys.
2. Actual `loadRuntimeLocationStates`: active Cycle, runtime-visible plan, one slot, required=2, filled=1, AT_RISK.
3. Actual authorized Dashboard fact pack and Coverage card loader: one shortfall, not “Coverage is in place.”
4. A different room in the same Department: no requirement invented from responsibility or physical type.
5. A second matching assignee: COVERED, no false gap.
6. An explicit Unit need in a separate Neighborhood: expansion to its two rooms only, with the correct Dashboard aggregate.
7. Shared physical room with a separately populated EVS expectation: its count remains 4, Dietary remains 2, and unauthorized Department fact calls reject.
8. Foreign Facility room/Department: no state contribution and unauthorized fact calls reject.

Result: **9 pass / 0 fail / 0 skip**, including the parent test. This result is included in the SQL batch below, not added twice. The fixture does not create OT classification to make Space targeting work. Existing hermetics preserve historical OT-only matches and rejection of unsupported Unit+OT combinations. Existing Coverage episode SQL tests also pass. A separate TypeScript check of the permanent regression passes using the repository's ambient module declarations.

## Authorization recertification

| Persona | Supported model and positive/negative evidence | Result |
|---|---|---|
| Dietary-only | MANAGER with Dietary membership; 3 permitted Records; EVS/Plant operational markers absent | PASS |
| EVS-only | Explicit EVS partner access/scope/role periods and accepted vendor head; 2 EVS Records; Dietary/Plant absent | PASS |
| Multi-Department | MANAGER explicitly heading Dietary and Plant; both permitted lenses positively populated | PASS |
| Facility-wide | Single Administrator; actual CDA VIEW grants for Dietary/Plant; exact combined Records count=5 | PASS |
| Read-only | Same Administrator's VIEW grant; actual Team write service rejects and table count is unchanged | PASS |
| Limited employee | STAFF with Unit access and one assigned room; assigned room visible; other rooms show explicit assignment denial without private data | PASS |
| Unauthorized Department | Forged lens/cookie cannot widen scope; populated EVS targets, Log Book and record drill-down deny access | PASS |
| Cross-facility | Foreign room/evidence deny access; foreign lens cannot widen scope; facility switch returns 403 | PASS |

Final matrix: **8 pass / 0 fail / 0 skip**, **21 response bodies inspected**. Chromium rendered Dietary and EVS partner Dashboards; the remaining scenarios used actual authenticated HTTP plus direct server integration. No unauthorized operational disclosure was confirmed. Native EVS customer Dashboard access was not fabricated: EVS remains DEVELOPMENT and uses its supported partner path here. Broad visibility is supported by policy grants, not inferred solely from the Administrator title. The one-seat Administrator rule is preserved.

For production-mode localhost HTTP probes, the harness sends the real password-login cookie explicitly, following the repository's existing offline-test convention. This handles Secure-cookie transport differences in Playwright's API client without disabling Secure cookies or changing authorization. An initial client-transport failure was corrected in the test-only harness and is not represented as an application authorization pass or a data disclosure.

## Final test ledger

| Final verification batch | Pass | Fail | Skip |
|---|---:|---:|---:|
| Affected hermetics, 28 files | 197 | 0 | 0 |
| SQL batch, including permanent regression | 18 | 0 | 0 |
| Original preflight server integration/diagnostics | 14 | 0 | 0 |
| Eight-persona browser/HTTP matrix | 8 | 0 | 0 |
| Offline tablet CI gate | 18 | 0 | 0 |
| Offline Chromium CI gate | 18 | 0 | 0 |
| **Total final executions** | **273** | **0** | **0** |

Counts are suite executions, not 273 distinct user journeys. The permanent regression's 9 cases are already included in the SQL batch; the clean-checkout replay and standalone after-fix run are not added again. Tablet and Chromium certify the same 18 scenarios in separate projects/databases.

The hermetic selection covers explicit-space matching, legacy OT/Unit handling, RLS, Dashboard fact scoping and Coverage presentation, Department authority, facility access, CDA write-manifest enforcement, notes, explicit Records applicability and meal-service location targeting. The SQL batch includes the permanent prefetch/composition/Dashboard regression, Coverage episode/call-off/time evaluation and Department authority/view/vendor-head checks. Test discovery sentinel passes with the new suite registered. No checks were weakened.

Clean candidate `npm run typecheck`: **PASS**. Production `npm run build` / `verify-build` (Next.js 16.3.5 webpack): **PASS**. Package lock, Prisma schema, migration SQL, permission configuration and feature defaults are unchanged.

## Offline and cross-phase preservation

The shared RLS loader is consumed by `src/lib/offline/build-runtime-bundle.ts`, so the earlier offline certification was not simply carried forward. Both existing CI gates were rerun against the repaired production build on separate fresh disposable databases: `ltc_verify_pf2d001_tablet` and `ltc_verify_pf2d001_chromium`. Each passed 18/18.

These gates retain command/receipt/conflict/idempotency, ONE_OFF, scope, recovery, encrypted offline state and date-locking behavior. No new Work or LF authoring was introduced. Department notes, explicit Records/Rhythm targeting, Menus, Key Time group-room timing, Team room membership and historical Audit/Review code are unchanged. Focused relevant controls passed; no unrelated architecture work was performed.

## Production, migrations and rollback

Read-only checks reconfirm:

- Vercel `ltc-manager`, project `prj_O3x1tS8yS1rFQEmd73rofZboIDCK`.
- Protected Phase 2C deployment `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` remains READY; both `vssyl.com` and `www.vssyl.com` point to it. Its protected SHA remains `7973254ee87da2d94291f4282337441944d042fa`.
- Public login and health endpoints return 200; the served offline asset still matches that protected Phase 2C commit.
- Production Neon has **187** finished migrations, both Phase 2D migrations unapplied and their new columns absent. The restore migration and all six Work compatibility tables remain present. Database inspection enforces a read-only connection and transaction.
- Three published Dietary LOCATION-grain Key Times each retain one group and nine explicit rooms; none is missing participating rooms. Live configuration was not edited.

No new migration is required. The only Phase 2D expansion remains, in order:

1. `20261109150000_department_space_responsibility_notes` — SHA-256 `5e8097cc259ba57d0ec9a34e14f022ce58004f4979e6f969108f0c69a6f0c16c`.
2. `20261109180000_coverage_template_item_space` — SHA-256 `b6fe0559b8ee0807c9ada8703123a8e68ca247422834ef80118c5e783edd8c5a`.

Both committed paths and certified bytes are unchanged. The repaired application requires the expanded schema before promotion. The nullable additive columns remain compatible with the protected Phase 2C application; rollback preserves them and operational records. Application rollback does not reverse database changes. Vercel's connector does not expose full Git metadata for this CLI deployment, so complete deployed-tree identity is supported by the preserved deployment report and matching served asset rather than claimed as a newly available full-tree attestation.

## Remaining debt and next action

ARR-003, ARR-004 and ARR-008 remain OPEN. Retain Work compatibility, historical Coverage OT matching, Audit/Review adapters, Facility-type Build overlays, profile/archetype persistence and existing RLS sidecars. Quantitative RLS readiness remains explicitly deferred; no score was invented. No physical-device tablet certification or new notification delivery matrix is claimed. Scheduled Evaluation and production Web Push remain inactive.

PF-2D-001 is resolved with no remaining material functional or authorization regression found in this certification scope. The historical preflight BLOCKED report is preserved and linked, not rewritten as an earlier PASS.

**Exact next action:** product-owner approval for the documented production release sequence. After that separate approval, reconfirm a recovery precaution and rollback availability, apply notes then Coverage Space with health checks, stage the certified candidate without aliases, smoke the full permitted flows, and promote only the verified deployment. None of those production actions was executed here. Stop after this remediation and certification.

Certification identity receipt: this exported report records the immutable documentation tip after its creation. The committed appendix identifies itself by its introducing commit; no self-referential SHA is claimed.
