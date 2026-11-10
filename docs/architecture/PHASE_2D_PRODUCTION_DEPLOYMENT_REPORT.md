# Phase 2D production deployment report

**Verdict: NOT DEPLOYED — BLOCKED. Phase 2D is staged, but it was not promoted to public production.**

The two authorized migrations completed successfully, and the exact certified candidate reached READY in a production-configured Vercel deployment. Pre-promotion verification discovered **PF-2D-002: the active People & Coverage page does not mount the Coverage editor**. Promotion was withheld under the product owner's stop-on-material-defect instruction. No application fix was made.

Public service remains on the protected Phase 2C deployment. The additive schema and all operational data are retained. No application rollback or database restore was executed.

## 1. Release and source identity

| Item | Result |
|---|---|
| Active repository | `ADTrauts/LTC-Manager`; original remote verified as `https://github.com/ADTrauts/LTC-Manager.git` |
| Certified application SHA | `319e5700fa6eda306aabe6bb186295055cec3595` |
| Staged candidate SHA | `ad87a4e308ee3fd3a445c6677b728aa0c728a3b5` |
| Source | Clean detached checkout: this chat's `work/phase2d-remediation-clean` |
| Application equivalence | PASS: candidate differs from certified application only under `docs/` |
| Non-documentation tree fingerprint | `5b0a9b287d2bec287c3e04406a15fa07cbf1ee019e26153b6d2da43f9d1173ab` |
| Fingerprint method | SHA-256 of NUL-joined `git ls-tree -r` records excluding `docs/` |
| Vercel project | `ltc-manager`, `prj_O3x1tS8yS1rFQEmd73rofZboIDCK` |
| Vercel team | `adtrauts-projects`, `team_djeRA5ZpmVTjCf6opbxfj6SS` |
| Upload verification | All **2,555 uploaded source-file hashes** match the clean candidate's Vercel dry-run manifest; no missing, changed, or extra files |
| Staged source metadata | `gitCommitSha` and `releaseCandidateSha` identify `ad87a4e…`; `certifiedApplicationSha` identifies `319e570…` |
| PF-2D-001 prefetch file | Included and verified; uploaded file SHA-1 `e6215d2e9bf42beb1a723e542a1a9616b816e906` |

The upload contains no private environment files, `.neon`, disposable fixture paths, node_modules, or duplicate migration directory. A generated ignored `tsconfig.tsbuildinfo` cache was moved outside the deployment source before its final dry run. No tracked candidate file was changed.

The original dirty Desktop checkout was not deployed from, reset, cleaned, merged, or rebased. Its deleted migration and duplicate directory were preserved. No GitHub push occurred. The detached candidate still has a clean tracked status at `ad87a4e…`; reporting changes are outside that deployment source.

## 2. Starting and final public production

| Item | Starting and final value |
|---|---|
| Recorded production SHA | `7973254ee87da2d94291f4282337441944d042fa` — Phase 2C |
| Public / protected rollback deployment | `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` — READY, reconfirmed |
| Unique URL | `https://ltc-manager-91mwwm29t-adtrauts-projects.vercel.app` |
| `vssyl.com` | Remains assigned to Phase 2C |
| `www.vssyl.com` | Remains assigned to Phase 2C; HTTP 308 redirect to `vssyl.com` preserved |
| Promotion timestamp | **None — no promotion** |
| Rollback performed | No |

Vercel's connector omits Git metadata for the old CLI deployment. Its full recorded SHA rests on the prior Phase 2C report/certification; current deployment ID, READY state, and public alias identity were independently reconfirmed. No claim of fresh byte-by-byte attestation of the old build is made.

## 3. Production recovery precaution

Initial Neon CLI discovery reached the separate certification organization `org-quiet-cake-64686025` and project `delicate-unit-53515438` (`vssyl-cert`). That credential could not see production. The user identified the second organization and completed browser sign-in. The production console then independently matched the project, branch, connected Vercel project, and previous deployment.

| Item | Verified value |
|---|---|
| Production organization | `org-hidden-leaf-35421142` |
| Production project | `damp-hill-35484256` — `ltc-manager-db` |
| Vercel Marketplace resource | `store_DfnKfqpGTZx9annu`, integration `icfg_IDIfhEIETZCnO22MbkCaiXcJ` |
| Source branch | `main`, `br-odd-cloud-avkhc7m6` |
| Recovery point type | Provider-native manual snapshot inside the existing production project |
| Recovery point identifier / saved console label | `phase2d-pre-expansion-ad87a4e-20261110T123613Z` |
| Original snapshot label | `main at 2026-11-10 12:36:13 UTC (manual)` |
| Created | **2026-11-10 12:36:13 UTC** / 07:36:13 EST |
| Snapshot size | **51.78 MB** |
| Snapshot retention | **Expires on: never**, verified in the console |
| Separate project history window | **6 hours**; this is distinct from snapshot retention |
| Verification | Success confirmation, saved label, listed size/no expiry, and supported one-step/multi-step recovery choices observed |
| Protection boundary | Existing authenticated production Neon organization/project; no export, new project, or serving compute created |
| Restore performed | **No** |

The snapshot is the authorized pre-expansion recovery point. It is not represented as a paid Neon Protected Branch or as an administrator-proof deletion lock. The console did not expose its internal snapshot UUID; the recorded unique label, source branch, and exact timestamp identify it in the production recovery UI. No subscription, network policy, permissions, or deployment protection setting was changed. No data was copied into the unrelated certification account.

## 4. Database baseline and ordered migration execution

Production connection identity matched the recorded endpoint `ep-plain-salad-avjht24p-pooler.c-11.us-east-1.aws.neon.tech`, through its equivalent unpooled host. Diagnostic queries used `default_transaction_read_only=on` and `BEGIN READ ONLY`. Credentials/connection strings are excluded from deliverables.

Before expansion: **187 finished migrations**, zero unfinished entries; both new columns absent; prior restore migration `20261106214500_restore_schema_after_premature_retirement` applied; all six Work compatibility tables present. Exactly the two authorized migrations were pending.

Applied-history verification found 186 exact checksums and the single pre-existing governed exception `20260423105656`. The repository's actual checksum classifier accepted that documented historical edit; its manifest and migration SQL are unchanged. No ledger rewrite or new exception occurred.

The approved Prisma workflow was used from verified isolated bundles. Step 1 contained the complete applied history plus only the notes migration (188 canonical SQL files); step 2 contained all 189. Each included SQL file and schema was byte-identical to the candidate. `prisma migrate status` independently identified only the intended pending migration before each invocation; its exit 1 meant pending work, not a migration failure. The deploy invocations were separate, with verification and public health checks between them.

| Step | Canonical migration | Expected and applied SHA-256 | Production ledger execution (UTC) |
|---|---|---|---|
| 1 | `20261109150000_department_space_responsibility_notes` | `5e8097cc259ba57d0ec9a34e14f022ce58004f4979e6f969108f0c69a6f0c16c` | Started 12:40:34.713164; finished **12:40:34.839058**, one applied step |
| 2 | `20261109180000_coverage_template_item_space` | `b6fe0559b8ee0807c9ada8703123a8e68ca247422834ef80118c5e783edd8c5a` | Started 12:41:28.512730; finished **12:41:28.631928**, one applied step |

Both deploy invocations exited 0. Canonical files were not renamed, edited, or removed. No manual schema SQL or fabricated migration receipt was used.

**After step 1:** independently verified **188** finished migrations at 12:40:55 UTC; nullable TEXT notes column present; Coverage column/index/FK still absent; all **19 responsibility rows** preserved. Phase 2C login/live/ready returned 200 at 12:41:02 UTC. Only then was step 2 executed.

**After step 2:** independently verified **189** finished migrations at 12:41:43 UTC, reconfirmed at 12:57:03 UTC; nullable TEXT `spaceId`; expected btree index; FK to `UnitSpace(id)` with ON UPDATE CASCADE / ON DELETE SET NULL. No pending/unfinished migration remained. Phase 2C login/live/ready stayed healthy.

All public column, index, and constraint metadata outside the two intended additions and their index/FK matches the pre-expansion baseline. Responsibility count remains 19. Production Coverage template items and Unit-targeted items were **0 before and after**; this verifies preservation of the observed empty set, not a live populated Unit Coverage scenario. All six Work tables remain; their combined row count stays 0. Compatibility profile/area/archetype row counts remain 0. No historical table/column or operational record was dropped.

**Final production migration count: 189.** Both additive migrations are retained despite promotion being withheld.

## 5. Live operational readiness

Three published Dietary LOCATION-grain Key Times remain configured, each with one group and nine explicit participating rooms; none has a missing-room configuration. No live settings were changed and no Room Type inference was substituted. The staged Dashboard renders the existing three nine-room timing entries and existing operational context. The exact participating-room meal-timing browser flow was not completed before the blocker stopped the release.

## 6. Staged application

| Item | Value |
|---|---|
| Staged deployment | `dpl_GsxhA1AheWVNNhd5A36Cxf5Jk8ZJ` |
| Unique URL | `https://ltc-manager-qd6z107hd-adtrauts-projects.vercel.app` |
| Target / configuration | Production |
| Created | 2026-11-10 12:42:22.024 UTC |
| READY | 2026-11-10 12:45:28.800 UTC |
| Method | Vercel CLI 65.12.1 `deploy --prod --skip-domain`, explicit verified project/team, candidate metadata |
| Remote build | Completed, including compilation and TypeScript |
| Alias reassignment | Withheld; both public aliases independently reconfirmed on Phase 2C |
| Deployment Protection | Retained; protected HTTP smokes used Vercel's authenticated curl |

The CLI's early no-wait message was not treated as readiness evidence; READY was separately verified. Complete source-file hash comparison used the untruncated Vercel API tree because the connector's file-tree result was truncated.

## 7. Pre-promotion smoke results

This is a bounded release smoke, not a rerun of the broad accepted certification. HTTP evidence includes 38 initial/canonical-path observations plus the focused Coverage redirect reproduction. Expected redirects and authorization denials are distinguished from successful page renders. Two exploratory `/build/facility` URLs returned 404 because that is not the registered Facility Builder route; the actual `/admin/facility/builder` subsequently passed under the Facility Administrator session.

| Gate | Observed result |
|---|---|
| Staged public login/live/ready | **PASS**, 200; readiness auth secret/database/migrations true |
| Existing manager + supervisor login | **PASS**, 200; session role/facility/primary Department verified |
| Authenticated readiness | **PASS**, 200 |
| Facility Administrator browser login / Dashboard | **PASS**, user completed sign-in; existing Terrace View FA context observed |
| Facility Builder physical identity | **PASS, rendered browser**: 6 floors, 17 neighborhoods, 21 rooms; Kensington Servery's canonical Space target, Servery classification/base Kitchen, parent hierarchy, and Food and Nutrition responsibility inspected without edits |
| Department Builder Locations | **PASS, authenticated HTTP**, canonical page renders 19 Department locations and read payloads |
| Department notes read | **PASS at server payload level**: 19 `departmentNote` fields; all observed production notes null. Interactive inspector read remained incomplete after the in-app browser reported a connection reset; no populated note or write lifecycle was exercised |
| Existing Coverage template read/Space targeting editor | **BLOCKED — PF-2D-002**: no active page mounts the editor; no live template item exists to substitute for this gate |
| Dashboard / supervisor Operations / room runtime | **PASS, authenticated HTTP**, existing context loads; unconfigured Coverage reports no coverage expectation/current gap rather than fabricating requirements |
| Records / Log Book / Reports | **PASS, authenticated HTTP**, existing evidence/read surfaces load |
| Operating Rhythm / Menu | **PASS, authenticated HTTP**, canonical Builder tabs and Menu runtime load; published configuration unchanged |
| Team scope | Existing Team configuration reads render; four Teams currently have zero explicit rooms. No new membership was invented; configured-room Team lifecycle not exercised in production |
| Assets / Repairs | **PASS for authorized existing Dietary/shared maintenance reads**, two existing assets and empty Work Order queue load; separate Plant-head lifecycle not exercised |
| Unauthenticated Dashboard | **PASS**, 307 to login |
| Manager cross-Department Builder request | **PASS**, final canonical Plant request returns 404 without Department payload |
| Manager/supervisor Facility Builder restriction | **PASS**, registered route redirects to Dashboard; authorized FA later opens it successfully |
| Offline runtime + service worker | **PASS for served asset identity**, exact candidate hashes below; live offline issuance/sync not executed |

Offline asset SHA-256: `space-offline.js` = `c565f577503a0d94b38fd3124408cdc1dd60978641b7579f64cd6a447e6b17c8`; `sw.js` = `27481d32eae0f49f51e721cf21a246cb31293003e5528e0d4df2f7d8876bf2fc`.

User-entered credentials, private login payloads, cookie jars, and deployment protection material are not included in deliverables. Login/session bookkeeping occurred as part of the explicitly authorized sign-in checks. No dummy notes, Coverage requirements, Assignments, evidence, Work Orders, resident records, employees, or permissions were created/changed.

## 8. PF-2D-001 verification and authorization evidence

PF-2D-001 remains **RESOLVED**. All staged source hashes match the repaired candidate, including `spaceId` selection/mapping in actual Prisma prefetch. The accepted production-built isolated database regression remains the proof of persisted Space Coverage → prefetch → canonical RLS → Dashboard, including required 2 / filled 1 → AT_RISK and one role at risk, full staffing, Unit expansion, and scope controls.

Production has **zero Coverage template items**, so no suitable existing live Space Coverage requirement could demonstrate the runtime repair. None was fabricated. A real production Space staffing shortfall is **not claimed tested**.

The accepted certification remains **273 pass / 0 fail / 0 skip**, typecheck/build PASS. Comprehensive authorization evidence remains the accepted eight-persona isolated browser/HTTP/server matrix (two rendered Dashboards). This release added existing manager/supervisor HTTP checks and a user-authenticated FA browser read; it did not create a STAFF identity or repeat the full persona matrix.

## 9. PF-2D-002 — promotion blocker

The active People & Coverage branch in `src/app/(protected)/admin/departments/[departmentId]/page.tsx:330` mounts only `TeamsPanel`. The existing `CoveragePanel` → `CoverageWorkspace` code has no active page consumer. Retired `?tab=coverage` entries map to `people` at `src/lib/department-administration/admin-nav.ts:56`; the staged server confirms HTTP 307 to that Teams-only section.

The authoritative Phase 1 contract places Coverage templates in Department Builder → People & Coverage (`01B…:113`), and Phase 2D-5 reports the explicit Unit/Space picker. The picker exists in source but is unreachable from the active Builder. An authorized user therefore cannot configure/inspect Coverage templates through the supported section. This newly discovered functional gap is not among the accepted limitations.

The omission also exists in the protected Phase 2C source. It predates PF-2D-001; it is not attributed to the three-line prefetch repair or to a source/upload mismatch. Its prior existence does not pass the authorized Phase 2D release gate. **No promotion and no application fix were executed.** See [PF-2D-002](./PHASE_2D_RELEASE_BLOCKER_PF_2D_002.md) for reproduction and the bounded remediation proposal.

## 10. Runtime logs and final public health

Vercel error/fatal log query for the staged deployment, **12:36:58.563–12:56:58.563 UTC**, returned **no matching entries**. No missing-column or unhandled Server Component exception appeared in the inspected HTTP bodies. Expected access denials/navigation probes are not represented as successful content loads. This bounded query is not a claim that every log level or all historical errors were inspected.

Final public checks at **12:58:04 UTC**: `/login`, `/api/health/live`, `/api/health/ready` all HTTP 200; readiness reports auth secret/database/migrations healthy. `www.vssyl.com/login` remains HTTP 308 to `https://vssyl.com/login`. TLS validation remained enabled.

The later in-app Department inspection encountered `ERR_CONNECTION_RESET`; that interactive check is unverified, while its earlier authenticated HTTP/server payload check passed. The local Python certificate-store issue and an unsupported curl flag were resolved using verified system curl and its supported argument layout, without weakening TLS or Deployment Protection.

**Post-promotion smokes and logs: NOT RUN — promotion did not occur.** Public service still serves the protected Phase 2C deployment, not staged Phase 2D assets.

## 11. Rollback, retained debt, and next action

Protected application rollback target `dpl_2fjfVAJporEGaDtFwzRVd9TgQhKS` remains READY and is still the public deployment. No alias rollback was needed. The additive schema is compatible with Phase 2C, as supported by its post-migration health checks. No down migration or destructive restore is authorized/performed.

Application rollback preserves database history. Phase 2C may not interpret newly authored Phase 2D Space Coverage or Department notes; if a later release is rolled back, preserve those records and explicitly identify unavailable functionality. Restoring old aliases would restore application availability, not full Phase 2D behavior or old database history. Snapshot restoration over newer operational records requires a separate decision and explicit authorization.

ARR-004 remains **OPEN**, with actual status updated: two production expansions applied, candidate staged READY, promotion withheld for PF-2D-002. ARR-003 and ARR-008 remain separate and open. Historical OT/Audit/Review, Work, profile/archetype/schema, Facility-type Build compatibility, deferred quantitative readiness, simulated tablet, incomplete rendered persona/notification-delivery coverage, and other accepted certification limits remain.

The existing historical BLOCKED preflight and successful PF-2D-001 remediation evidence are preserved. No Scheduled Evaluation, production Web Push, new feature defaults, Phase 2E, or unrelated architecture work was introduced. No push or production-triggering Git branch change occurred.

**Required continuation:** remediate the missing Coverage composition within the accepted People & Coverage owner, preserve existing authority and retired-link redirects, verify the reachable explicit Space/Unit editor in an isolated database, certify the changed application SHA, and obtain release authorization for that changed candidate. Production is already at migration 189; do not reapply/edit the two migration receipts or remove their columns. Recheck the retained recovery point, public baseline, and rollback target before any future staging/promotion.
